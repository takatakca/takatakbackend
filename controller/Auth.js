const Users = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sendOtpToPhone = require('../utils/sendOtpToPhone');
const sendOtpToEmail = require('../utils/sendOtpToEmail');
const generateOtp = require('../utils/generateOtp');


const register = async(req, res)=>{
    const { firstName, lastName, email, username, phone } = req.body;
    try {
        //check if require field is provided
        if(!firstName || !lastName || !email || !phone || !username){
            return res.status(400).json({message:'Please fill in all fields it required'});
        }

        const existUserNAme = await Users.findOne({ username });

        // Check if user already exists by email or phone
        const existingUser = await Users.findOne({
            $or: [{ email }, { phone }]
        });
        
        // Show conflict error if user exists
        if (existingUser) {
            return res.status(409).json({ error: 'User already exists please login' });
        }

        if (existUserNAme) {
            return res.status(409).json({ error: 'Username is taken' });
        }
        


        // Send OTP via  whatsapp this function is imported
        const otp = generateOtp();
        await sendOtpToPhone(phone, otp);
        const hashedOtp = await bcrypt.hash(otp, 10);

        // Create new user instance
        const RegUser = new Users({
            firstName,
            lastName,
            email,
            username,
            phone,
            userotp:hashedOtp,
            regTokenExpires: Date.now() + 5 * 60 * 1000
        });

    
        // return res.status(200).json({ message: "OTP sent successfully" });

        RegUser.userotp = hashedOtp;
        RegUser.regTokenExpires = Date.now() + 5 * 60 * 1000;// 5min

          // Save user to DB
        await RegUser.save();


        // Generate a JWT token
        const token = jwt.sign({ userId: RegUser._id }, process.env.SECRET_TOKEN, { expiresIn: '1h' });

        res.status(201).json({
            message: "New register user created",
            userId: RegUser._id,
            token: token,
            
        });
    } catch (error) {
        console.log(error);
        console.error(error.response?.data || error);

        res.status(500).json({ error: 'Something went wrong, please try again later' });
    }
}



const verifyOtp = async (req, res) => {
    const { phone, email, otp } = req.body;

    try {
        const user = await Users.findOne(email ? { email }:{ phone });

        if (!user || !user.userotp) {
            return res.status(400).json({ msg: "User or OTP not found" });
        }

        // Check if OTP is expired
        if (user.regTokenExpires < Date.now()) {
            return res.status(400).json({ msg: 'OTP has expired' });
        }

        // Check if OTP matches
        const isMatch = await bcrypt.compare(otp, user.userotp);

        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid OTP recheck!' });
        }

        // Mark user as verified 
        user.isVerified = true;
        user.userotp = undefined;
        user.regTokenExpires = undefined;
        await user.save();

        const token = jwt.sign(
            { userId: user._id },
            process.env.SECRET_TOKEN,
            { expiresIn: '1h' }
          );
          
          return res.status(200).json({
            msg: 'User verified successfully',
            token,
            userId: user._id
          });
          

    } catch (error) {
        console.error("OTP verification error:", error);
        return res.status(500).json({ msg: 'Something went wrong' });
    }
};

const requestNewCode = async (req, res) => {
    const { phone, email } = req.body;

    try {
        let userDetail;
        let otpTarget;
        let otp = generateOtp();

        // Determine whether the user is using email or phone
        if (email) {
            userDetail = await Users.findOne({ email });
            if (!userDetail) {
                return res.status(401).json({ error: 'Invalid email address' });
            }
            otpTarget = 'email';
        } else if (phone) {
            userDetail = await Users.findOne({ phone });
            if (!userDetail) {
                return res.status(401).json({ error: 'Invalid phone number' });
            }
            otpTarget = 'phone';
        } else {
            return res.status(400).json({ message: 'Email or phone number is required' });
        }

        // Send the OTP based on target type
        if (otpTarget === 'email') {
            await sendOtpToEmail(userDetail.email, otp);
        } else if (otpTarget === 'phone') {
            await sendOtpToPhone(userDetail.phone, otp);
        }

        // Hash OTP and update user record
        userDetail.userotp = await bcrypt.hash(otp, 10);
        userDetail.regTokenExpires = Date.now() + 5 * 60 * 1000; // expires in 5 minutes
        await userDetail.save();

        return res.status(200).json({ msg: `OTP has been resent to your ${otpTarget}` });

    } catch (error) {
        console.error("Error resending code:", error);
        return res.status(500).json({ msg: 'Something went wrong. Try again later.' });
    }
};


const login = async (req, res) => {
    const { phone, email } = req.body;

    try {
        let userLog;
        let otpTarget;

        if (email) {
            userLog = await Users.findOne({ email });
            if (!userLog) {
                return res.status(401).json({ error: ' email address not exist ' });
            }
            otpTarget = 'email';
        } else if (phone) {
            userLog = await Users.findOne({ phone });
            if (!userLog) {
                return res.status(401).json({ error: ' phone number not exist ' });
            }
            otpTarget = 'phone';
        } else {
            return res.status(400).json({ message: 'Email or phone number is required' });
        }

        const otp = generateOtp();
        const hashedOtp = await bcrypt.hash(otp, 10);

        userLog.userotp = hashedOtp;
        userLog.regTokenExpires = Date.now() + 5 * 60 * 1000;
        await userLog.save();

        if (otpTarget === 'email') {
            await sendOtpToEmail(userLog.email, otp);
            return res.status(200).json({ message: 'OTP sent to email' });
        } else {
            await sendOtpToPhone(userLog.phone, otp);
            return res.status(200).json({ message: 'OTP sent to phone' });
        }

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

module.exports = {
    register,
    verifyOtp,
    requestNewCode,
    login,
    
};