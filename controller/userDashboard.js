const User = require("../models/User");
const { getOrders, getInvoices } = require("../services/upmindService");

 const getUserDashboard = async (req, res) => {
  try {
    // Exclude password & refreshToken when fetching the user
    const user = await User.findById(req.user.id).select("-password -refreshToken");
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    let orders = [];
    let invoices = [];

    // if (!user.upmindClientId) {
    //   return res.json({ orders: [], invoices: [], activity: [] });
    // }

    if (user.upmindClientId) {
      try {
        // Fetch orders (domains, hosting, etc)
        orders = await getOrders(user.upmindClientId);
        invoices = await getInvoices(user.upmindClientId); // optional if you implement it
      } catch (err) {
        console.error("Upmind API error:", err.response?.data || err.message);
         // Still respond with user data, but empty orders/invoices
      }
    }


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
      orders,
      invoices,
      activity,
    });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Could not load dashboard" });
  }
};

module.exports = {getUserDashboard}


// const User = require("../models/User");

// const getUserDashboard = async(req, res)=>{
//     try {
//         const userId = req.user._id;
//         const user = await User.findById(userId).select('-password');
//         if (!user){
//             return res.status(404).json({message: 'User not found'});
//         }
//         return res.status(200).json({
//             status: true,
//             message: "User dashboard fetched successfully",
//             data: user
//         });
//     } catch (error) {
//         console.error("Error fetching user dashboard", error);
//         return res.status(500).json({ error: "Internal server error"})
//     }
// }

// module.exports = {getUserDashboard}