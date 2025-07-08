const Users = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const sendOtpToPhone = require('../utils/sendOtpToPhone');
const sendOtpToEmail = require('../utils/sendOtpToEmail');
const generateOtp = require('../utils/generateOtp');
const { normalizePhone, formatForWhatsApp } = require('../utils/phoneUtils');


const register = async(req, res)=>{
    const { firstName, lastName, email, username, phone } = req.body;
    try {
        // Validate required fields
        if(!firstName || !lastName || !email || !phone || !username){
            return res.status(400).json({message:'Please fill in all required fields.'});
        }

        // Normalize phone number with + accept by twilio to send code to whatsapp/number
        const storedPhone = normalizePhone(phone); // for DB
        const whatsappPhone = formatForWhatsApp(storedPhone); // for WhatsApp



        // Check if username or email/phone already exists
        const [existingUser, existingUsername] = await Promise.all([
            Users.findOne({ $or: [{ email }, { phone: storedPhone }] }),
            Users.findOne({ username })
        ]);
        
        // Show conflict error if user exists
        if (existingUser) {
            return res.status(409).json({ error: 'User already exists. Please log in.' });
        }

        if (existingUsername) {
            return res.status(409).json({ error: 'Username is taken' });
        }
        

        const otp = generateOtp();

        try {
            await sendOtpToPhone(whatsappPhone, otp);           
        } catch (twilioError) {
            console.error('Twilio Error:', twilioError.message || twilioError);
            return res.status(500).json({ error: 'Failed to send OTP. Check phone number or try again later.' });
        }

        const hashedOtp = await bcrypt.hash(otp, 10);

         // Save user with OTP
        const RegUser = new Users({
            firstName,
            lastName,
            email,
            username,
            phone:storedPhone,
            userotp:hashedOtp,
            regTokenExpires: Date.now() + 5 * 60 * 1000 // 5min
        });

        
        await RegUser.save();
        
        res.status(201).json({
            message: "New user registered. OTP sent.",
            userId: RegUser._id,
            
        });
    } catch (error) {
        console.error('Registration Error:', error.response?.data || error);
        return res.status(500).json({ error: 'Something went wrong. Please try again later.' });
    }
}



const verifyOtp = async (req, res) => {
    const { phone, email, otp } = req.body;

    try {
        const user = await Users.findOne(email ? { email }:{ phone: normalizePhone(phone) });

        if (!user || !user.userotp) {
            return res.status(400).json({ message: "User or OTP not found" });
        }

        // Check if OTP is expired
        if (user.regTokenExpires < Date.now()) {
            return res.status(400).json({ message: 'OTP has expired' });
        }

        // Check if OTP matches
        const isMatch = await bcrypt.compare(otp, user.userotp);     
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid OTP recheck!' });
        }

        // Mark user as verified 
        user.isVerified = true;
        user.verifiedAt = new Date();
        user.userotp = undefined;
        user.regTokenExpires = undefined;
        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email, phone: user.phone},
            process.env.SECRET_TOKEN,
            { expiresIn: '1h' }
          );

          
          return res.status(200).json({
            message: 'User verified successfully',
            token,
            userId: user._id
          });
          

    } catch (error) {
        console.error("OTP verification error:", error);
        return res.status(500).json({ message: 'Something went wrong' });
    }
};

const requestNewCode = async (req, res) => {
    const { phone, email } = req.body;

    try {
        let userDetail;
        let otpTarget;

        // Determine whether the user is using email or phone
        if (email) {
            userDetail = await Users.findOne({ email });
            if (!userDetail) {
                return res.status(401).json({ error: 'Invalid email address' });
            }
            otpTarget = 'email';
        } else if (phone) {
            const storedPhone = normalizePhone(phone);
            userDetail = await Users.findOne({ phone: storedPhone });

            if (!userDetail) {
                return res.status(401).json({ error: 'Invalid phone number' });
            }
            otpTarget = 'phone';
        } else {
            return res.status(400).json({ message: 'Email or phone number is required' });
        }

        // NEW COOLDOWN LOGIC (30 sec)
        const cooldownDuration = 30 * 1000;
        if (userDetail.lastOtpRequestedAt && Date.now() - userDetail.lastOtpRequestedAt < cooldownDuration) {
        return res.status(429).json({ message: 'Please wait before requesting another code.' });
        }

        let otp = generateOtp();

        // Send the OTP based on target type
        if (otpTarget === 'email') {
            await sendOtpToEmail(userDetail.email, otp);
        } else if (otpTarget === 'phone') {
            await sendOtpToPhone(formatForWhatsApp(userDetail.phone), otp);
        }


        // Hash OTP and update user record
        userDetail.userotp = await bcrypt.hash(otp, 10);
        userDetail.regTokenExpires = Date.now() + 5 * 60 * 1000; // expires in 5 minutes
        userDetail.lastOtpRequestedAt = Date.now(); // UPDATE THIS
        
        await userDetail.save();

        return res.status(200).json({ message: `OTP has been resent to your ${otpTarget}` });

    } catch (error) {
        console.error("Error resending code:", error);
        return res.status(500).json({ message: 'Something went wrong. Try again later.' });
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
                return res.status(401).json({ error: 'Email address not found' });
            }
            otpTarget = 'email';
        } else if (phone) {
            const storedPhone = normalizePhone(phone);
            userLog = await Users.findOne({ phone: storedPhone });

            if (!userLog) {
                return res.status(401).json({ error: 'Phone number not found' });
            }
            otpTarget = 'phone';
        } else {
            return res.status(400).json({ message: 'Email or phone number is required' });
        }

        const otp = generateOtp();

        if (otpTarget === 'email') {
            await sendOtpToEmail(userLog.email, otp);
            // return res.status(200).json({ message: 'OTP sent to email' });
        } else {
            await sendOtpToPhone(formatForWhatsApp(userLog.phone), otp);
        }
        
        const hashedOtp = await bcrypt.hash(otp, 10);
        userLog.userotp = hashedOtp;
        userLog.regTokenExpires = Date.now() + 5 * 60 * 1000;
        await userLog.save();

        return res.status(200).json({ message: `OTP sent to your ${otpTarget}` });
        

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