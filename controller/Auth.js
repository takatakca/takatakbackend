
const Users = require('../models/User');
const { normalizePhone } = require("../utils/phoneUtils");
const {sendOtpToPhone, checkOtpFromPhone} = require("../utils/sendOtpToPhone");
const sendOtpToEmail = require("../utils/sendOtpToEmail");
const generateOtp = require("../utils/generateOtp");
const bcrypt = require("bcrypt");
const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { createSessionAndSetCookies } = require("./authSession")
const { createClient } = require("../services/upmindService");
const jwt = require('jsonwebtoken');
const fs = require("fs");
const jwkToPem = require("jwk-to-pem");
const { importSPKI, exportJWK } = require("jose");


// ======================================
// REGISTER — phone or email
// ======================================

const register = async (req, res) => {
    const { firstName, lastName, email, username, phone } = req.body;

        try {
            if (!firstName || !lastName || !email || !phone || !username) {
                return res.status(400).json({ message: 'Please fill in all required fields.' });
            }

            // Normalize phone number with + accept by twilio to send code to whatsapp/number
            const storedPhone = normalizePhone(phone); // DB: digits only

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
            
            // Send PHONE OTP via Verify (no local OTP storage)
            try {
            await sendOtpToPhone(storedPhone);
            } catch (err) {
            console.error('Twilio Verify Error:', err.message || err);
            return res.status(500).json({ error: 'Failed to send OTP. Check phone number or try again later.' });
            }
            
            // Create user record (no userotp/regTokenExpires for phone)
            const RegUser = new Users({
            firstName,
            lastName,
            email,
            username,
            phone: storedPhone,
            });

            await RegUser.save();

            return res.status(201).json({
            message: "New user registered. OTP sent.",
            userId: RegUser._id,
            });

        } catch (error) {
            console.error('Registration Error:', error.response?.data || error);
            return res.status(500).json({ error: 'Something went wrong. Please try again later.' });
        }
};


// VERIFY OTP — phone: Verify check; email: DIY compare
const verifyOtp = async (req, res) => {
    const { phone, email, otp } = req.body;
    // const user = await Users.findOne(email ? { email: email.toLowerCase() }:{ phone: formatE164(normalizePhone(phone)) });
    try {
        // PHONE (Twilio Verify)
        if(phone){
            if (!otp) return res.status(400).json({ message: 'OTP is required' });
            
            const to = normalizePhone(phone); // "+1..."
           
            // Twilio Verify: check the code
            const check = checkOtpFromPhone( otp );
                  // at this point, OTP is verified by Twilio    
                  if (check.status !== 'approved') {
                    return res.status(400).json({ message: 'Invalid or expired code' });
                }

            // update user record as verified
             const user = await Users.findOne({ phone: to });
             if (!user) return res.status(404).json({ message: 'User not found' });
            user.isVerified = true;
            user.verifiedAt = new Date();
            user.userotp = undefined;        // clear any email OTP leftovers
            user.regTokenExpires = undefined;

            // Ensure Upmind client exists
            if (!user.upmindClientId) {
            try {
            const upmindRes = await createClient(user);
            user.upmindClientId = upmindRes.client?.id || upmindRes.id;
            } catch (err) {
            console.error("Failed to create Upmind client:", err.response?.data || err.message);
            // Not fatal – user can still be verified even if Upmind failed
            }
        }
        await user.save();


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

        // EMAIL (DIY – your existing bcrypt flow)
        if(email){
            if (!otp) return res.status(400).json({ message: 'OTP is required' });
            const user = await Users.findOne({ email: email.toLowerCase() });
            if (!user || !user.userotp) return res.status(400).json({ message: "User or OTP not found" });
            if (user.regTokenExpires < Date.now()) return res.status(400).json({ message: 'OTP has expired' });
            const isMatch = await bcrypt.compare(otp, user.userotp);
            if (!isMatch) return res.status(400).json({ message: 'Invalid OTP recheck!' });

            user.isVerified = true;
            user.verifiedAt = new Date();
            user.userotp = undefined;
            user.regTokenExpires = undefined;
            
             // Create Upmind client only if not already created
            if (!user.upmindClientId) {
                try {
                const upmindRes = await createClient(user);
                user.upmindClientId = upmindRes.client?.id || upmindRes.id;
                } catch (err) {
                console.error("Failed to create Upmind client:", err.response?.data || err.message);
                // Not fatal – user can still be verified even if Upmind failed
                }
            }
            await user.save();
    
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
        console.error("verifyOtp error:", error);
        return res.status(500).json({ message: 'Something went wrong' });
    }

};

const publicKey = fs.readFileSync("./keys/public.pem", "utf8")
// onvert to JWK and serve as JWKS
const getJwks = async(req, res) => {
    try {
        const keyObj = await importSPKI(publicKey, "RS256");
        const jwk = await exportJWK(keyObj);

        jwk.use = "sig";
        jwk.kid = "takatak-key"; // Key ID
        jwk.alg = "RS256";

        res.json({ keys: [jwk] });
    } catch (error) {
        res.status(500).json({ error: "Failed to generate JWKS" });
    }
  }





// const { createClient } = require("../services/upmindService");
// const bcrypt = require('bcrypt');
// const fs = require("fs");
// const { importSPKI, exportJWK } = require("jose");
// const sendOtpToPhone = require('../utils/sendOtpToPhone');   // Verify SMS
// const sendOtpToEmail = require('../utils/sendOtpToEmail');   // your existing DIY email
// const generateOtp = require('../utils/generateOtp');         // used only for email
// const { normalizePhone, formatE164 } = require('../utils/phoneUtils');
// const { createSessionAndSetCookies } = require("./authSession");




  
    
  

//       
//       if (email) {
//         
  
//         
//         
//         
  

  

//       }
  
//       
//     } catch (error) {

//     }
//   };
  

// // JWKS (as you had)
// const publicKey = fs.readFileSync("./keys/public.pem", "utf8");
// const getJwks = async (req, res) => {
//   try {
//     const keyObj = await importSPKI(publicKey, "RS256");
//     const jwk = await exportJWK(keyObj);
//     jwk.use = "sig";
//     jwk.kid = "takatak-key";
//     jwk.alg = "RS256";
//     res.json({ keys: [jwk] });
//   } catch (error) {
//     res.status(500).json({ error: "Failed to generate JWKS" });
//   }
// };

// // RESEND — phone via Verify, email via DIY
// const requestNewCode = async (req, res) => {
//   const { phone, email } = req.body;
//   try {
//     const cooldownMs = 30 * 1000;

//     if (phone) {
//       const user = await Users.findOne({ phone: normalizePhone(phone) });
//       if (!user) return res.status(401).json({ error: 'Invalid phone number' });

//       if (user.lastOtpRequestedAt && Date.now() - user.lastOtpRequestedAt < cooldownMs) {
//         return res.status(429).json({ message: 'Please wait before requesting another code.' });
//       }

//       await sendOtpToPhone(user.phone); // Verify
//       user.lastOtpRequestedAt = Date.now();
//       await user.save();

//       return res.status(200).json({ message: 'OTP has been resent to your phone' });
//     }

//     if (email) {
//       const user = await Users.findOne({ email });
//       if (!user) return res.status(401).json({ error: 'Invalid email address' });

//       if (user.lastOtpRequestedAt && Date.now() - user.lastOtpRequestedAt < cooldownMs) {
//         return res.status(429).json({ message: 'Please wait before requesting another code.' });
//       }

//       const otp = generateOtp();
//       await sendOtpToEmail(user.email, otp);
//       user.userotp = await bcrypt.hash(otp, 10);
//       user.regTokenExpires = Date.now() + 5 * 60 * 1000;
//       user.lastOtpRequestedAt = Date.now();
//       await user.save();

//       return res.status(200).json({ message: 'OTP has been resent to your email' });
//     }

//     return res.status(400).json({ message: 'Email or phone number is required' });
//   } catch (error) {
//     console.error("Error resending code:", error);
//     return res.status(500).json({ message: 'Something went wrong. Try again later.' });
//   }
// };

// // LOGIN — phone via Verify start; email via DIY
// const login = async (req, res) => {
//   const { phone, email } = req.body;
//   try {
//     if (phone) {
//       const user = await Users.findOne({ phone: normalizePhone(phone) });
//       if (!user) return res.status(401).json({ error: 'Phone number not found' });

//       await sendOtpToPhone(user.phone); // Verify start
//       user.lastOtpRequestedAt = Date.now();
//       await user.save();

//       return res.status(200).json({ message: 'OTP sent to your phone' });
//     }

//     if (email) {
//       const user = await Users.findOne({ email });
//       if (!user) return res.status(401).json({ error: 'Email address not found' });

//       const otp = generateOtp();
//       await sendOtpToEmail(user.email, otp);
//       user.userotp = await bcrypt.hash(otp, 10);
//       user.regTokenExpires = Date.now() + 5 * 60 * 1000;
//       user.lastOtpRequestedAt = Date.now();
//       await user.save();

//       return res.status(200).json({ message: 'OTP sent to your email' });
//     }

//     return res.status(400).json({ message: 'Email or phone number is required' });
//   } catch (error) {
//     console.error("Login Error:", error);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };

// module.exports = {
//   register,
//   verifyOtp,
//   getJwks,
//   requestNewCode,
//   login,
// };



// const Users = require('../models/User');
// 
// const bcrypt = require('bcrypt');

// const sendOtpToPhone = require('../utils/sendOtpToPhone');
// const sendOtpToEmail = require('../utils/sendOtpToEmail');
// const generateOtp = require('../utils/generateOtp');
//
// 
// 
// 





  


// // const verifyOtp = async (req, res) => {
// //     const { phone, email, otp } = req.body;

// //     console.log("Incoming body:", req.body);

// //     const query = email ? { email } : { phone: normalizePhone(phone) };
// //     console.log("Query used:", query);

// //     const user = await Users.findOne(query);
// //     console.log("User found:", user);


// //     try {
// //         



// //         



// //         // const privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH, "utf8")
// //         // const token = jwt.sign(
// //         //     { userId: user._id, email: user.email, phone: user.phone},
// //         //     // process.env.SECRET_TOKEN,
// //         //     privateKey,
// //         //     { algorithm: "RS256", expiresIn: '1h' }
// //         //   );

          
// //         //   return res.status(200).json({
// //         //     message: 'User verified successfully',
// //         //     token,
// //         //     userId: user._id
// //         //   });
          

// //     } catch (error) {
// //         console.error("OTP verification error:", error);
// //         return res.status(500).json({ message: 'Something went wrong' });
// //     }
// // };




// const requestNewCode = async (req, res) => {
//     const { phone, email } = req.body;

//     try {
//         let userDetail;
//         let otpTarget;

//         // Determine whether the user is using email or phone
//         if (email) {
//             userDetail = await Users.findOne({ email });
//             if (!userDetail) {
//                 return res.status(401).json({ error: 'Invalid email address' });
//             }
//             otpTarget = 'email';
//         } else if (phone) {
//             const storedPhone = normalizePhone(phone);
//             userDetail = await Users.findOne({ phone: storedPhone });

//             if (!userDetail) {
//                 return res.status(401).json({ error: 'Invalid phone number' });
//             }
//             otpTarget = 'phone';
//         } else {
//             return res.status(400).json({ message: 'Email or phone number is required' });
//         }

//         // NEW COOLDOWN LOGIC (30 sec)
//         const cooldownDuration = 30 * 1000;
//         if (userDetail.lastOtpRequestedAt && Date.now() - userDetail.lastOtpRequestedAt < cooldownDuration) {
//         return res.status(429).json({ message: 'Please wait before requesting another code.' });
//         }

//         let otp = generateOtp();

//         // Send the OTP based on target type
//         if (otpTarget === 'email') {
//             await sendOtpToEmail(userDetail.email, otp);
//         } else if (otpTarget === 'phone') {
//             await sendOtpToPhone(formatForWhatsApp(userDetail.phone), otp);
//         }


//         // Hash OTP and update user record
//         userDetail.userotp = await bcrypt.hash(otp, 10);
//         userDetail.regTokenExpires = Date.now() + 5 * 60 * 1000; // expires in 5 minutes
//         userDetail.lastOtpRequestedAt = Date.now(); // UPDATE THIS
        
//         await userDetail.save();

//         return res.status(200).json({ message: `OTP has been resent to your ${otpTarget}` });

//     } catch (error) {
//         console.error("Error resending code:", error);
//         return res.status(500).json({ message: 'Something went wrong. Try again later.' });
//     }
// };


// const login = async (req, res) => {
//     const { phone, email } = req.body;

//     try {
//         let userLog;
//         let otpTarget;
        
//         if (email) {
//             userLog = await Users.findOne({ email });        
//             if (!userLog) {
//                 return res.status(401).json({ error: 'Email address not found' });
//             }
//             otpTarget = 'email';
//         } else if (phone) {
//             const storedPhone = normalizePhone(phone);
//             userLog = await Users.findOne({ phone: storedPhone });

//             if (!userLog) {
//                 return res.status(401).json({ error: 'Phone number not found' });
//             }
//             otpTarget = 'phone';
//         } else {
//             return res.status(400).json({ message: 'Email or phone number is required' });
//         }

//         const otp = generateOtp();

//         if (otpTarget === 'email') {
//             await sendOtpToEmail(userLog.email, otp);
//             // return res.status(200).json({ message: 'OTP sent to email' });
//         } else {
//             await sendOtpToPhone(formatForWhatsApp(userLog.phone), otp);
//         }
        
//         const hashedOtp = await bcrypt.hash(otp, 10);
//         userLog.userotp = hashedOtp;
//         userLog.regTokenExpires = Date.now() + 5 * 60 * 1000;
//         await userLog.save();

//         return res.status(200).json({ message: `OTP sent to your ${otpTarget}` });
        

//     } catch (error) {
//         console.error("Login Error:", error);
//         res.status(500).json({ error: 'Internal server error' });
//     }
// };

// module.exports = {
//     register,
//     verifyOtp,
//     getJwks,
//     requestNewCode,
//     login,
    
// };