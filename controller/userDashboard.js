const User = require("../models/User");

const getUserDashboard = async(req, res)=>{
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select('-password');
        if (!user){
            return res.status(404).json({message: 'User not found'});
        }
        return res.status(200).json({
            status: true,
            message: "User dashboard fetched successfully",
            data: user
        });
    } catch (error) {
        console.error("Error fetching user dashboard", error);
        return res.status(500).json({ error: "Internal server error"})
    }
}

module.exports = {getUserDashboard}