"use strict";
const User = require("../models/User");
const { getOrders, getInvoices, getTickets } = require("../services/upmindService");

/**
 * Fetch only the authenticated legacy user's data.
 * Product-specific tenant dashboards must implement a separate entitlement-
 * checked tenancy layer; this endpoint must not cross-link merchant records.
 */
async function getUserDashboard(req, res) {
  try {
    // upmindClientId has select:false in the schema; opt in for this owner only.
    const user = await User.findById(req.user.id).select("+upmindClientId");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    let orders = [];
    let invoices = [];
    let tickets = [];
    let integrationStatus = user.upmindClientId ? "available" : "not_linked";
    if (user.upmindClientId) {
      try {
        [orders, invoices, tickets] = await Promise.all([
          getOrders(user.upmindClientId),
          getInvoices(user.upmindClientId),
          getTickets(user.upmindClientId),
        ]);
      } catch (err) {
        integrationStatus = "unavailable";
        console.error("Upmind dashboard unavailable:", err.message);
      }
    }

    // A missing account link is not proof of zero orders, invoices or tickets.
    // Only a successful Upmind response can provide numerical totals.
    const failed = integrationStatus !== "available";
    const summary = {
      totalOrders: failed ? null : orders.length,
      totalInvoices: failed ? null : invoices.length,
      unpaidInvoices: failed ? null : invoices.filter(i => i.status === "unpaid").length,
      activeTickets: failed ? null : tickets.filter(t => t.status === "open").length,
    };

    res.set("Cache-Control", "private, no-store");
    return res.json({
      user: {
        id: user._id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        upmindClientId: user.upmindClientId || null,
      },
      summary,
      activeProducts: orders.filter(o => o.status === "active").map(o => o.domain || o.product),
      invoices,
      tickets,
      integrationsAvailable: integrationStatus === "available",
      integrationStatus,
      activity: [
        { action: "login", at: user.lastActionAt || null },
        { action: "registered", at: user.createdAt || null },
      ],
    });
  } catch (err) {
    console.error("Dashboard error:", err.message);
    return res.status(500).json({ error: "Could not load dashboard" });
  }
}

module.exports = { getUserDashboard };
