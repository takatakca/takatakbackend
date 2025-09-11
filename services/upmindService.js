const axios = require("axios");

// const UP_API = "https://fimjpyw0mnzy.upmind.io/api";
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

// Create client in Upmind
async function createClient(user) {
  try {
    const res = await client.post("/admin/clients", {
      brand_id: UPMIND_BRAND_ID,
      email: user.email,
      firstname: user.firstName,
      lastname: user.lastName,
      phone: user.phone || undefined,
    });
    return res.data;
  } catch (err) {
    console.error("Upmind createClient error:", err.response?.data || err.message);
    throw new Error("Failed to create Upmind client");
  }
}

// Fetch orders
async function getOrders(clientId) {
  const res = await client.get(`/admin/clients/${clientId}/orders`);
  return res.data;
}

// Fetch invoices
async function getInvoices(clientId) {
  const res = await client.get(`/admin/clients/${clientId}/invoices`);
  return res.data;
}

module.exports = { createClient, getOrders, getInvoices };


// const axios = require("axios");

// const UP_API = "https://api.upmind.io/api";
// const ADMIN_TOKEN = process.env.UPMIND_KEY;

// const client = axios.create({
//   baseURL: UP_API,
//   headers: {
//     Authorization: `Bearer ${ADMIN_TOKEN}`,
//     "Content-Type": "application/json",
//   },
// });

// // Create new client in Upmind
// async function createClient(user) {
//   const res = await client.post("/admin/clients", {
//     email: user.email,
//     firstname: user.firstName,
//     lastname: user.lastName,
//   });
//   return res.data;
// }

// module.exports = { createClient };