const axios = require("axios");
const { decrypt } = require("../utils/crypto");
const UP_API = "https://api.upmind.io/api";
const ADMIN_TOKEN = process.env.UPMIND_KEY;
const UPMIND_BRAND_ID = process.env.UPMIND_BRAND_ID; 

const client = axios.create({
  baseURL: UP_API,
  headers: {
    Authorization: `Bearer ${ADMIN_TOKEN}`,
    "Content-Type": "application/json",
  },
});

/**
 * Create a client in Upmind
 */
async function createClient(user, plainPassword) {
  try {
    const payload = {
      brand_id: UPMIND_BRAND_ID,
      email: user.email,
      password: plainPassword,
      login_enabled: true,
      firstname: user.firstName || "",
      lastname: user.lastName || "",
      phone: user.phone || "",
      
    };

    const res = await client.post("/admin/clients", payload);
    return res.data;
  } catch (err) {
    console.error("Upmind createClient error:", err.response?.data || err.message);
    throw new Error("Failed to create Upmind client");
  }
}

/**
 * Fetch and normalize orders
 */
async function getOrders(clientId) {
  try {
    const res = await client.get(`/admin/clients/${clientId}/orders`);
    return res.data?.data?.map(order => ({
      id: order.id,
      product: order.product?.name || "Unknown product",
      domain: order.domain?.name || null,
      status: order.status,
      createdAt: order.created_at,
      nextDue: order.next_due_date,
    })) || [];
  } catch (err) {
    console.error("Upmind getOrders error:", err.response?.data || err.message);
    return [];
  }

}

/**
 * Fetch and normalize invoices
 */

async function getInvoices(clientId) {
  try {
    const res = await client.get(`/admin/clients/${clientId}/invoices`);
     return res.data?.data?.map(inv => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amount: inv.total,
      issuedAt: inv.issued_at,
      dueAt: inv.due_at,
      items: inv.items?.map(i => i.description) || [],
    })) || [];
  } catch (err) {
    console.error("Upmind getInvoices error:", err.response?.data || err.message);
    return [];
  }

}

/**
 * Fetch and normalize tickets
 */
async function getTickets(clientId) {
  try {
    const res = await client.get(`/admin/clients/${clientId}/tickets`);
    return res.data?.data?.map(ticket => ({
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      lastReplyAt: ticket.last_reply_at,
    })) || [];
  } catch (err) {
    console.error("Upmind getTickets error:", err.response?.data || err.message);
    return [];
  }
}

/**
 * Ensure a user has a matching Upmind client
 */
async function ensureUpmindClient(user) {
  if (user.upmindClientId) return user;

  const plainPassword = user.encryptedPassword ? decrypt(user.encryptedPassword) : null;
  if (!plainPassword) {
    user.upmindRetryNeeded = true;
    await user.save();
    return user;
  }

  try {
    const upmindRes = await createClient(user, plainPassword);
    user.upmindClientId = upmindRes.id || upmindRes.data?.id;
    user.encryptedPassword = undefined;
    await user.save();
  } catch (err) {
    console.error("ensureUpmindClient failed:", err.response?.data || err.message);
    user.upmindRetryNeeded = true;
    await user.save();
  }

  return user;
}


module.exports = { createClient, getOrders, getInvoices, getTickets, ensureUpmindClient };