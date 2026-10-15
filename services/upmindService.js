"use strict";
const axios = require("axios");
const { decrypt } = require("../utils/crypto");

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
    record && record.id !== undefined &&
    String(record.email || "").trim().toLowerCase() === expectedEmail &&
    String(record.brand_id ?? record.brand?.id ?? "") === expectedBrand
  );
  return matches.length === 1 ? matches[0] : null;
}

function validClientId(clientId) {
  const value = String(clientId || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error("Invalid Upmind client ID");
  }
  return value;
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

async function getOrders(clientId) {
  requireUpmindSettings();
  try {
    const res = await client.get(`/admin/clients/${validClientId(clientId)}/orders`);
    return (res.data?.data || []).map(order => ({
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
    const res = await client.get(`/admin/clients/${validClientId(clientId)}/invoices`);
    return (res.data?.data || []).map(inv => ({
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
    const res = await client.get(`/admin/clients/${validClientId(clientId)}/tickets`);
    return (res.data?.data || []).map(ticket => ({
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
    // If a legacy sign-in loaded the temporary Upmind password, clear it
    // once the existing association has already been established.
    if (user.encryptedPassword) {
      user.encryptedPassword = undefined;
      await user.save();
    }
    return user;
  }
  try {
    requireUpmindSettings();
    // Search all returned pages; do not provision a duplicate client when
    // the provider gave only page one, a malformed response, or unknown total.
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
      user.upmindClientId = String(matched.id);
      user.upmindRetryNeeded = false;
      // The account can use its existing Upmind association; keeping a
      // reversible login password is no longer necessary.
      user.encryptedPassword = undefined;
      await user.save();
      return user;
    }
    if (candidates.length) {
      // Search results might contain other people or brands; do not attach or
      // provision duplicate customers while identity is ambiguous.
      user.upmindRetryNeeded = true;
      await user.save();
      return user;
    }

    const password = user.encryptedPassword ? decrypt(user.encryptedPassword) : null;
    if (!password) {
      user.upmindRetryNeeded = true;
      await user.save();
      return user;
    }
    const created = await createClient(user, password);
    const newId = created.id || created.data?.id;
    if (!newId) throw new Error("Upmind returned no client ID");
    user.upmindClientId = String(newId);
    user.encryptedPassword = undefined;
    user.upmindRetryNeeded = false;
    await user.save();
  } catch (err) {
    console.error("Upmind association pending review:", err.message);
    user.upmindRetryNeeded = true;
    await user.save();
  }
  return user;
}

module.exports = {
  createClient, getOrders, getInvoices, getTickets, ensureUpmindClient, findExactClientMatch,
  collectCompleteClientSearch,
};
