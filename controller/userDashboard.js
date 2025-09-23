const User = require("../models/User");
const { getOrders, getInvoices, getTickets  } = require("../services/upmindService");

/**
 * Get client dashboard
 */
 const getUserDashboard = async (req, res) => {
  try {
    // Exclude password & refreshToken when fetching the user
    const user = await User.findById(req.user.id).select("-password -refreshToken -userotp");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    let orders = [];
    let invoices = [];
    let tickets = [];


    if (user.upmindClientId) {
      try {
        // Fetch orders (domains, hosting, etc)
        orders = await getOrders(user.upmindClientId);
        invoices = await getInvoices(user.upmindClientId);
        tickets = await getTickets(user.upmindClientId);
      } catch (err) {
        console.error("Upmind API error:", err.response?.data || err.message);
         // Still respond with user data, but empty orders/invoices
      }
    }

    const summary = {
      totalOrders: orders.length,
      totalInvoices: invoices.length,
      unpaidInvoices: invoices.filter(i => i.status === "unpaid").length,
      activeTickets: tickets.filter(t => t.status === "open").length,
    };


    // You can also store + fetch your own "activity logs" here
    // Example: last login, last purchase, etc.
    const activity = [
      { action: "login", at: user.lastLogin || null },
      { action: "registered", at: user.createdAt },
    ];

    res.json({
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
      activity
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Could not load dashboard" });
  }
};

module.exports = {getUserDashboard}