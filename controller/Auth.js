
const Users = require('../models/User');
const { normalizePhone } = require("../utils/phoneUtils");
const {sendOtpToPhone, checkOtpFromPhone} = require("../utils/sendOtpToPhone");
const sendOtpToEmail = require("../utils/sendOtpToEmail");
const generateOtp = require("../utils/generateOtp");
const { reserveEmailOtpAttempt, consumeEmailOtp } = require("../utils/emailOtpAttempts");
const { encrypt, decrypt } = require("../utils/crypto");
const bcrypt = require("bcrypt");
const { createSessionAndSetCookies } = require("./authSession")
const { createClient, ensureUpmindClient } = require("../services/upmindService");
const jwt = require('jsonwebtoken');
const fs = require("fs");
const jwkToPem = require("jwk-to-pem");
const { log } = require('console');
// const { importSPKI, exportJWK } = require("jose");



// ======================================
// REGISTER — phone or email
// ======================================

const register = async (req, res) => {
    const { firstName, lastName, email, username, phone, password } = req.body;

        try {
            if (!firstName || !lastName || !email || !phone || !username || !password) {
                return res.status(400).json({ message: 'Please fill in all required fields.' });
            }

            // Normalize phone number with + accept by twilio to send code to whatsapp/number
            const storedPhone = normalizePhone(phone); // Store E.164; never log sensitive phone numbers.
            

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
            /*
            from here
            // Send PHONE OTP via Verify (no local OTP storage)

            //   // i comment this because trial balance is exhausted.
            // try {

            // // await sendOtpToPhone(storedPhone);
            
            // } catch (err) {
            // console.error('Twilio Verify Error:', err.message || err);
            // return res.status(500).json({ error: 'Failed to send OTP. Check phone number or try again later.' });
            // }
            to here
            */

            //  Encrypt password before saving
            const encryptedPassword = encrypt(password);
            
            // Create user record (no userotp/regTokenExpires for phone)
            const RegUser = new Users({
            firstName,
            lastName,
            email,
            username,
            phone: storedPhone,
            encryptedPassword, //  temporary storage
            });

            // so im using this temporarilly for testing purpose
            try {
      // (Commented out: Twilio for now)
      // await sendOtpToPhone(storedPhone);

      // Use email OTP for testing
      const otp = generateOtp();
      await sendOtpToEmail(email, otp);

      // Save OTP hash + expiry
      RegUser.userotp = await bcrypt.hash(otp, 10);
      RegUser.regTokenExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 mins
      RegUser.otpAttempts = 0;
    } catch (err) {
      console.error("OTP Error:", err.message || err);
      return res.status(500).json({
        error: "Failed to send OTP. Please try again later.",
      });
    }


            await RegUser.save();

            return res.status(201).json({
            message: "New user registered. OTP sent.",
            userId: RegUser._id,
            });

        } catch (error) {
            if (error?.code === 'INVALID_PHONE_NUMBER') {
                return res.status(400).json({ error: 'Invalid phone number. Use international format (+country code).' });
            }
            console.error('Registration Error:', error.response?.status || error.message);
            return res.status(500).json({ error: 'Something went wrong. Please try again later.' });
        }
};


// ======================================
// LOGIN — phone via Twilio Verify / email via DIY
// ======================================
const login = async (req, res) => {
    const { phone, email } = req.body;

    try {

      if (phone) {
        const user = await Users.findOne({ phone: normalizePhone(phone) });
        if (!user) return res.status(401).json({ error: "Phone number not found" });
        if (user.lastOtpRequestedAt && Date.now() - new Date(user.lastOtpRequestedAt).getTime() < 30_000) {
          return res.status(429).json({ error: "Please wait before requesting another verification code." });
        }
  
        // console.log("EMAIL:", email);
        // console.log("USER FOUND:", user);

        await sendOtpToPhone(user.phone);
        user.lastOtpRequestedAt = Date.now();
        await user.save();
  
        return res.status(200).json({ message: "OTP sent to your phone" });
      }
  
      if (email) {
        const user = await Users.findOne({ email });
        if (!user) return res.status(401).json({ error: "Email address not found" });
        if (user.lastOtpRequestedAt && Date.now() - new Date(user.lastOtpRequestedAt).getTime() < 30_000) {
          return res.status(429).json({ error: "Please wait before requesting another verification code." });
        }
  
        // console.log("EMAIL:", email);
        // console.log("USER FOUND:", user);

        const otp = generateOtp();
        await sendOtpToEmail(user.email, otp);
  
        user.userotp = await bcrypt.hash(otp, 10);
        user.regTokenExpires = new Date(Date.now() + 5 * 60 * 1000);
        user.otpAttempts = 0;
        user.lastOtpRequestedAt = new Date();
        await user.save();
  
        return res.status(200).json({ message: "OTP sent to your email" });
      }
  
      return res.status(400).json({ message: "Email or phone number is required" });
    } catch (error) {
      if (error?.code === 'INVALID_PHONE_NUMBER') {
        return res.status(400).json({ error: 'Invalid phone number. Use international format (+country code).' });
      }
      console.error("Login Error:", error.message);
      res.status(500).json({ error: "Internal server error" });
    }
  };

// VERIFY OTP — phone: Verify check; email: DIY compare
// ======================================
// VERIFY OTP — Twilio Verify (phone) / bcrypt check (email)
// ======================================
const verifyOtp = async (req, res) => {
    const { phone, email, otp } = req.body;

    try {
        let user
        // PHONE (Twilio Verify)
        if(phone){
            if (!otp) return res.status(400).json({ message: 'OTP is required' });

            user = await Users.findOne({ phone: normalizePhone(phone) }).select("+encryptedPassword");
            if (!user) return res.status(401).json({ error: "Phone number not found" });  
           
            // Twilio Verify: check the code
            const check = await checkOtpFromPhone(user.phone, otp );
                  // at this point, OTP is verified by Twilio    
                  if (!check.valid) {
                    return res.status(400).json({ message: 'Invalid or expired code' });
                }

                const wasAlreadyVerified = user.isVerified;

            // update user record as verified
            user.isVerified = true;
            user.verifiedAt = new Date();
            user.userotp = undefined; // clear any email OTP leftovers
            user.regTokenExpires = undefined;

            if (wasAlreadyVerified) {
              user.lastAction = "login";
            } else {
              user.lastAction = "register";
            }
            user.lastActionAt = new Date();
            user.activity.push({ action: user.lastAction, at: user.lastActionAt });

            // Verification must be durable even when Upmind association already exists.
            await user.save();
            // Ensure Upmind client exists
            user = await ensureUpmindClient(user)


        // Create session + tokens
            const { accessToken, sid } = await createSessionAndSetCookies(user, req, res);
  
            return res.status(200).json({
                message: "User verified successfully",
                token: accessToken,
                sid,
                userId: user._id,
                phone: user.phone,
                email: user.email,
                upmindClientId: user.upmindClientId,
            });

        }

        // Email OTP: atomic attempt limit and single-use consumption.
        if (email) {
            if (typeof email !== "string" || typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
                return res.status(400).json({ message: "Valid email and six-digit OTP are required" });
            }
            const pending = await Users.findOne({ email: email.trim().toLowerCase() })
                .select("+userotp +encryptedPassword +otpAttempts");
            if (!pending) return res.status(400).json({ message: "Invalid or expired code" });
            if (!pending.userotp) return res.status(400).json({ message: "Invalid or expired code" });
            if (!pending.regTokenExpires || Date.now() >= new Date(pending.regTokenExpires).getTime()) {
                pending.userotp = undefined;
                pending.regTokenExpires = undefined;
                pending.otpAttempts = 0;
                await pending.save();
                return res.status(400).json({ message: "Invalid or expired code" });
            }

            // The attempt is reserved in MongoDB before comparing the hash.
            const reserved = await reserveEmailOtpAttempt(Users, pending);
            if (!reserved) {
                return res.status(429).json({ message: "Too many attempts or code expired. Request a new code." });
            }
            const correct = await bcrypt.compare(otp, reserved.userotp);
            if (!correct) {
                return res.status(400).json({ message: "Invalid or expired code" });
            }

            // Only the first correct concurrent request can consume this hash.
            user = await consumeEmailOtp(Users, reserved);
            if (!user) {
                return res.status(400).json({ message: "Invalid or already used code" });
            }

            user = await ensureUpmindClient(user);
            const { accessToken, sid } = await createSessionAndSetCookies(user, req, res);
            return res.status(200).json({
                message: "User verified successfully",
                token: accessToken,
                sid,
                userId: user._id,
                phone: user.phone,
                email: user.email,
                upmindClientId: user.upmindClientId,
            });
        }

        return res.status(400).json({ message: 'Phone or email is required' });  

    } catch (error) {
        if (error?.code === 'INVALID_PHONE_NUMBER') {
            return res.status(400).json({ error: 'Invalid phone number. Use international format (+country code).' });
        }
        console.error("verifyOtp error:", error.message);
        return res.status(500).json({ message: 'Something went wrong' });
    }

};

// ======================================
// RESEND OTP — phone via Verify / email via DIY
// ======================================
const requestNewCode = async (req, res) => {
    const { phone, email } = req.body;
    try {
      const cooldownMs = 30 * 1000;
  
      if (phone) {
        const user = await Users.findOne({ phone: normalizePhone(phone) });
        if (!user) return res.status(401).json({ message: "Invalid phone number" });
  
        if (user.lastOtpRequestedAt && Date.now() - user.lastOtpRequestedAt < cooldownMs) {
          return res.status(429).json({ message: "Please wait before requesting another code." });
        }
  
        await sendOtpToPhone(user.phone);
        user.lastOtpRequestedAt = Date.now();
        await user.save();
  
        return res.status(200).json({ message: "OTP has been resent to your phone" });
      }
  
      if (email) {
        const user = await Users.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(401).json({ message: "Invalid email address" });
  
        if (user.lastOtpRequestedAt && Date.now() - user.lastOtpRequestedAt.getTime() < cooldownMs) {
          return res.status(429).json({ message: "Please wait before requesting another code." });
        }
  
        const otp = generateOtp();
        await sendOtpToEmail(user.email, otp);
  
        user.userotp = await bcrypt.hash(otp, 10);
        user.regTokenExpires = new Date(Date.now() + 5 * 60 * 1000);
        user.otpAttempts = 0;
        user.lastOtpRequestedAt = new Date();
        

        await user.save();
  
        return res.status(200).json({ message: "OTP has been resent to your email" });
      }
  
      return res.status(400).json({ message: "Email or phone number is required" });
    } catch (error) {
      if (error?.code === 'INVALID_PHONE_NUMBER') {
        return res.status(400).json({ error: 'Invalid phone number. Use international format (+country code).' });
      }
      console.error("Error resending code:", error.message);
      return res.status(500).json({ message: "Something went wrong. Try again later." });
    }
  };


const createUpmindSession = async (req, res) => {
  try {
    // 1. Make sure user is authenticated (e.g. req.user is set by your auth middleware)
    const userId = req.user.id;

    // 2. Fetch upmindClientId securely
    const user = await Users.findById(userId).select("+upmindClientId");
    if (!user || !user.upmindClientId) {
      return res.status(404).json({ message: "Upmind client not found" });
    }

    // 3. Create a short-lived token wrapping upmindClientId
    const token = jwt.sign(
      {
        upmindId: user.upmindClientId,
        sub: user._id.toString(),
      },
      process.env.UPMIND_SECRET, // keep this private
      { expiresIn: "5m" } // only valid for 5 minutes
    );

    // 4. Return token to frontend
    res.json({ upmindToken: token });
  } catch (err) {
    console.error("Error creating Upmind session:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};


// Read the currently configured public key on each request. Signers and
// verifiers read the same external key path; caching this at module load can
// serve a stale JWKS after a controlled key rotation.
const getJwks = async (_req, res) => {
    try {
        const publicKeyPath = process.env.PUBLIC_KEY_PATH ||
            require("node:path").join(__dirname, "..", "keys", "public.pem");
        const publicKey = fs.readFileSync(publicKeyPath, "utf8");
        const { importSPKI, exportJWK } = await import("jose");
        const keyObj = await importSPKI(publicKey, "RS256");
        const jwk = await exportJWK(keyObj);
        jwk.use = "sig";
        jwk.kid = process.env.JWT_KEY_ID || "takatak-key";
        jwk.alg = "RS256";
        res.set("Cache-Control", "public, max-age=60");
        return res.json({ keys: [jwk] });
    } catch (error) {
        console.error("JWKS configuration unavailable:", error.message);
        return res.status(503).json({ error: "JWKS unavailable" });
    }
};

  module.exports = {
    register,
    verifyOtp,
    getJwks,
    createUpmindSession,
    requestNewCode,
    login,
  };





