const User = require("../models/User");
const { createClient } = require("../services/upmindService");

// Ensure user has an Upmind clientId
const ensureUpmindClient = async (req, res) => {
    try {
      const user = await User.findById(req.user.id);
  
      if (!user) return res.status(404).json({ error: "User not found" });
  
      // If no Upmind client yet, create one
      if (!user.upmindClientId) {
        const clientData = await createClient(user);
        user.upmindClientId = clientData.id;
        await user.save();
      }
  
      res.json({ upmindClientId: user.upmindClientId });
    } catch (err) {
      console.error("ensureUpmindClient error:", err.response?.data || err.message);
      res.status(500).json({ error: "Could not sync Upmind client" });
    }
  };

module.exports = { ensureUpmindClient };





// const upmindClient = require("../utils/upmindClient");

// const getUserOrders = async (req, res) => {
//   try {
//     // assuming req.user comes from your authMiddleware
//     const userEmail = req.user.email;

//     const response = await upmindClient.get("/admin/orders", {
//       params: { customer_email: userEmail }, // filter by logged-in user's email
//     });

//     res.json(response.data);
//   } catch (error) {
//     console.error("Upmind Orders Error:", error.response?.data || error.message);
//     res.status(500).json({ error: "Failed to fetch user orders" });
//   }
// };

// const getUserInvoices = async (req, res) => {
//     try {
//       const userEmail = req.user.email;
  
//       const response = await upmindClient.get("/admin/invoices", {
//         params: { customer_email: userEmail },
//       });
  
//       res.json(response.data);
//     } catch (error) {
//       console.error("Upmind Invoices Error:", error.response?.data || error.message);
//       res.status(500).json({ error: "Failed to fetch user invoices" });
//     }
//   };
  
//   module.exports = { getUserOrders, getUserInvoices };
