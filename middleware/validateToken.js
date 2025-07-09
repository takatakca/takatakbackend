const jwt = require('jsonwebtoken');
const User = require("../models/User");
require('dotenv').config();

const isLoggedIn = async(req, res, next)=>{
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({ error: 'Authorization header missing or malformed' });
        }

        const token = authHeader.split(" ")[1];
        const decoded = jwt.verify(token, process.env.SECRET_TOKEN);
        req.user = await User.findById(decoded.userId);

        if (!req.user) {
            return res.status(401).json({ error: 'User not found' });
        }
        
        next();
    } catch (error) {
        console.log(error.message);
        res.status(403).json({ error: 'Invalid token' });
    }
}

const isAdmin = async (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        return next();
    } else {
        return res.status(403).json({ status: false, message: "You are not authorized, only for admin" });
    }
};

const hasLogin = async(req, res, next) => {
    if(!req.user){
        return res.status(401).json({error: 'You are not logged in'});
    }

    next();
}

module.exports = {
    isLoggedIn,
    isAdmin,
    hasLogin
}