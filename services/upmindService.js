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

// Create client in Upmind
async function createClient(user, plainPassword) {
  try {
    const payload = {
      brand_id: UPMIND_BRAND_ID,
      email: user.email,
      password: plainPassword,
    };
    if (user.firstName) payload.firstname = user.firstName;
    if (user.lastName) payload.lastname = user.lastName;
    if (user.phone) payload.phone = user.phone;
    if (user.username) payload.username = user.username;

    if (user.address) {
      payload.address = {
        line1: user.address.line1,
        line2: user.address.line2 || "",
        city: user.address.city,
        state: user.address.state,
        postcode: user.address.postcode,
        country: user.address.country,
      };
    }
    const res = await client.post("/admin/clients", payload);
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


module.exports = { createClient, getOrders, getInvoices, ensureUpmindClient };


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