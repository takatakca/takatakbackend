const Users = require("../models/User");

const getUserDashboard = async(req, res)=>{
    try {
        const userId = req.user._id;
        const user = await Users.findById(userId);
        if (!user){
            return res.status(404).json({message: 'User not found'});
        }
    } catch (error) {
        console.error("Error fetching user dashboard", error);
        return res.status(500).json({ error: "Internal server error"})
    }
}

module.exports = {getUserDashboard}