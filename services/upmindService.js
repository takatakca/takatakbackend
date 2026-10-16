"use strict";
const axios = require("axios");
const { decrypt } = require("../utils/crypto");
const Users = require("../models/User");
const {
  acquireProvisionLease, beginProvisionAttempt, flagProvisionReview,
  persistProvisionedClient, releaseProvisionLease,
} = require("../utils/upmindProvisionLease");

const UP_API = "https://api.upmind.io/api";
const ADMIN_TOKEN = process.env.UPMIND_KEY;
const UPMIND_BRAND_ID = process.env.UPMIND_BRAND_ID;
const client = axios.create({
  baseURL: UP_API,
  timeout: 10000,
  headers: {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    "Content-Type": "application/json",
  },
});

function requireUpmindSettings() {
  if (!ADMIN_TOKEN || !UPMIND_BRAND_ID) {
    throw new Error("Upmind integration is not configured");
  }
}

// A search response can be fuzzy or incomplete: never link a wrong customer.
function findExactClientMatch(candidates, email, brandId) {
  if (!Array.isArray(candidates) || !email || !brandId) return null;
  const expectedEmail = String(email).trim().toLowerCase();
  const expectedBrand = String(brandId);
  const matches = candidates.filter(record =>
    record && isValidClientId(record.id) &&
    String(record.email || "").trim().toLowerCase() === expectedEmail &&
    String(record.brand_id ?? record.brand?.id ?? "") === expectedBrand
  );
  return matches.length === 1 ? matches[0] : null;
}

function isValidClientId(clientId) {
  if (typeof clientId !== "string" && !(typeof clientId === "number" && Number.isSafeInteger(clientId) && clientId > 0)) {
    return false;
  }
  return /^[A-Za-z0-9_-]{1,128}$/.test(String(clientId));
}

function validClientId(clientId) {
  if (!isValidClientId(clientId)) {
    throw new Error("Invalid Upmind client ID");
  }
  return String(clientId);
}

// Upmind list endpoints paginate (limit/offset) and include a total count.
// A missing/partial result set is never proof that an account does not exist.
async function collectCompleteClientSearch(fetchPage, options = {}) {
  const limit = options.limit || 25;
  const maxResults = options.maxResults || 100;
  if (!Number.isInteger(limit) || !Number.isInteger(maxResults) ||
      limit < 1 || maxResults < limit) {
    throw new RangeError("Invalid Upmind search pagination limits");
  }

  const all = [];
  let total = null;
  while (total === null || all.length < total) {
    const response = await fetchPage({ limit, offset: all.length });
    if (!response || typeof response !== "object" ||
        (response.status !== undefined && response.status !== "ok") ||
        !Array.isArray(response.data) ||
        !Number.isSafeInteger(response.total) || response.total < 0) {
      throw new Error("Incomplete Upmind client search response");
    }
    if (total !== null && total !== response.total) {
      throw new Error("Upmind client search changed during pagination");
    }
    total = response.total;
    if (total > maxResults || response.data.length > limit ||
        all.length + response.data.length > total ||
        (total > all.length && response.data.length === 0)) {
      throw new Error("Upmind client search pagination is incomplete or exceeds review limit");
    }
    all.push(...response.data);
  }
  return all;
}

async function createClient(user, plainPassword) {
  requireUpmindSettings();
  if (!plainPassword) throw new Error("Cannot provision Upmind without verified credentials");
  try {
    const res = await client.post("/admin/clients", {
      brand_id: UPMIND_BRAND_ID,
      email: user.email,
      password: plainPassword,
      login_enabled: true,
      firstname: user.firstName || "",
      lastname: user.lastName || "",
      phone: user.phone || "",
    });
    return res.data;
  } catch (err) {
    console.error("Upmind client creation failed:", err.response?.status || err.code || err.message);
    throw new Error("Failed to create Upmind client");
  }
}

// Do not report missing or partially paginated API data as a real zero.
// Billing collections use the same complete-list contract as client searches.
async function fetchCompleteClientCollection(clientId, segment) {
  const id = validClientId(clientId);
  return collectCompleteClientSearch(async page => (
    await client.get(`/admin/clients/${id}/${segment}`, {
      params: { limit: page.limit, offset: page.offset },
    })
  ).data, { limit: 25, maxResults: 1000 });
}

async function getOrders(clientId) {
  requireUpmindSettings();
  try {
    const orders = await fetchCompleteClientCollection(clientId, "orders");
    return orders.map(order => ({
      id: order.id,
      product: order.product?.name || "Unknown product",
      domain: order.domain?.name || null,
      status: order.status,
      createdAt: order.created_at,
      nextDue: order.next_due_date,
    }));
  } catch (err) {
    // Do not turn transport errors into misleading empty account data.
    console.error("Upmind orders unavailable:", err.response?.status || err.code || err.message);
    throw new Error("Upmind orders unavailable");
  }
}

async function getInvoices(clientId) {
  requireUpmindSettings();
  try {
    const invoices = await fetchCompleteClientCollection(clientId, "invoices");
    return invoices.map(inv => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount: inv.total,
      issuedAt: inv.issued_at,
      dueAt: inv.due_at,
      items: inv.items?.map(i => i.description) || [],
    }));
  } catch (err) {
    console.error("Upmind invoices unavailable:", err.response?.status || err.code || err.message);
    throw new Error("Upmind invoices unavailable");
  }
}

async function getTickets(clientId) {
  requireUpmindSettings();
  try {
    const tickets = await fetchCompleteClientCollection(clientId, "tickets");
    return tickets.map(ticket => ({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      lastReplyAt: ticket.last_reply_at,
    }));
  } catch (err) {
    console.error("Upmind tickets unavailable:", err.response?.status || err.code || err.message);
    throw new Error("Upmind tickets unavailable");
  }
}

async function ensureUpmindClient(user) {
  if (user.upmindClientId) {
    if (user.encryptedPassword) {
      user.encryptedPassword = undefined;
      await user.save();
    }
    return user;
  }

  let lease = null;
  try {
    requireUpmindSettings();

    // Claim before searching, not merely before POST. A worker which searched
    // before another worker created a customer must never act on that stale
    // empty result after it obtains a later lease.
    lease = await acquireProvisionLease(Users, user._id);
    if (!lease) {
      user.upmindRetryNeeded = true;
      return user; // Never overwrite the winning worker's linked account.
    }

    const candidates = await collectCompleteClientSearch(async page =>
      (await client.get("/admin/clients", {
        params: {
          search: user.email || user.phone,
          brand_id: UPMIND_BRAND_ID,
          limit: page.limit,
          offset: page.offset,
        },
      })).data
    );
    const matched = findExactClientMatch(candidates, user.email, UPMIND_BRAND_ID);
    if (matched) {
      const clientId = validClientId(matched.id);
      const linked = await persistProvisionedClient(Users, user._id, lease, clientId);
      if (!linked) throw new Error("Upmind association lease lost; manual review needed");
      user.upmindClientId = clientId;
      user.encryptedPassword = undefined;
      user.upmindRetryNeeded = false;
      return user;
    }

    if (candidates.length || !user.encryptedPassword) {
      // Ambiguous/provider-owned results or no verified legacy credentials:
      // do not attempt a remote create.
      await flagProvisionReview(Users, user._id, lease);
      user.upmindRetryNeeded = true;
      return user;
    }

    // Decrypt before making the create attempt durable. Bad credentials
    // cannot produce a partial remote provisioning request.
    const password = decrypt(user.encryptedPassword);

    // Atomic barrier prevents another POST if an earlier attempt timed out,
    // crashed after sending, or lost its lease before recording its response.
    // A subsequent worker may still find and link an existing exact match.
    if (!await beginProvisionAttempt(Users, user._id, lease)) {
      await flagProvisionReview(Users, user._id, lease);
      user.upmindRetryNeeded = true;
      return user;
    }

    const created = await createClient(user, password);
    const newId = validClientId(created.id ?? created.data?.id);
    const saved = await persistProvisionedClient(Users, user._id, lease, newId);
    if (!saved) throw new Error("Upmind association lease lost; manual review needed");
    user.upmindClientId = newId;
    user.encryptedPassword = undefined;
    user.upmindRetryNeeded = false;
  } catch (err) {
    console.error("Upmind association pending review:", err.message);
    user.upmindRetryNeeded = true;
    if (lease) {
      try {
        await flagProvisionReview(Users, user._id, lease);
      } catch {
        console.error("Upmind review-state persistence unavailable");
      }
    }
  } finally {
    if (lease) {
      await releaseProvisionLease(Users, user._id, lease)
        .catch(() => console.error("Upmind provisioning lease cleanup pending"));
    }
  }
  return user;
}

module.exports = {
  createClient, getOrders, getInvoices, getTickets, ensureUpmindClient, findExactClientMatch,
  collectCompleteClientSearch,
};
