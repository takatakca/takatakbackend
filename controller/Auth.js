
const Users = require('../models/User');
const { normalizePhone } = require("../utils/phoneUtils");
const { findLegacyPhoneOtpUser, findUniqueLegacyPhoneUser } = require("../utils/legacyOtpAccount");
const {sendOtpToPhone, checkOtpFromPhone} = require("../utils/sendOtpToPhone");
const sendOtpToEmail = require("../utils/sendOtpToEmail");
const generateOtp = require("../utils/generateOtp");
const { reserveEmailOtpAttempt, consumeEmailOtp } = require("../utils/emailOtpAttempts");
const { reserveLegacyOtpRequest, EMAIL_OTP_LIFETIME_MS } = require("../utils/legacyOtpIssuance");
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
  const { firstName, lastName, email, username, phone, password } = req.body || {};
  try {
    if (![firstName, lastName, email, username, password].every(
      v => typeof v === "string" && v.trim().length > 0
    ) || typeof phone !== "string" || !phone.trim()) {
      return res.status(400).json({ message: "Please fill in all required fields." });
    }

    const storedEmail = email.trim().toLowerCase();
    const storedPhone = normalizePhone(phone);
    const [existingUser, existingUsername] = await Promise.all([
      Users.findOne({ $or: [{ email: storedEmail }, { phone: storedPhone }] }),
      Users.findOne({ username }),
    ]);
    if (existingUser) return res.status(409).json({ error: "User already exists. Please log in." });
    if (existingUsername) return res.status(409).json({ error: "Username is taken" });

    // Legacy Upmind enrolment still requires an encrypted temporary credential.
    // Its eventual removal is tracked in Auth retirement PR #1.
    const encryptedPassword = encrypt(password);
    const otp = generateOtp();
    const now = new Date();
    const RegUser = new Users({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: storedEmail,
      username: username.trim(),
      phone: storedPhone,
      encryptedPassword,
      userotp: await bcrypt.hash(otp, 10),
      regTokenExpires: new Date(now.getTime() + EMAIL_OTP_LIFETIME_MS),
      otpAttempts: 0,
      lastOtpRequestedAt: now,
    });

    // Never email a code for an account that has not committed in MongoDB.
    // Duplicate-key races are handled after the insert, not just via findOne.
    await RegUser.save();
    try {
      await sendOtpToEmail(storedEmail, otp);
    } catch {
      // Persisted account can request a fresh OTP after its 30-second cooldown.
      return res.status(503).json({
        error: "Account registered but verification email delivery failed. Request a new code shortly.",
        userId: RegUser._id,
      });
    }
    return res.status(201).json({
      message: "New user registered. OTP sent.",
      userId: RegUser._id,
    });
  } catch (error) {
    if (error?.code === "INVALID_PHONE_NUMBER") {
      return res.status(400).json({ error: "Invalid phone number. Use international format (+country code)." });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ error: "User already exists or username is taken" });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ error: "Invalid registration information" });
    }
    console.error("Registration Error:", error.response?.status || error.message);
    return res.status(500).json({ error: "Something went wrong. Please try again later." });
  }
};

// Reserve the cooldown in MongoDB before invoking Twilio or SendGrid.
// For email, the hash and expiry commit atomically in the same write; delivery
// failure keeps the cooldown in place, allowing safe retry after 30 seconds.
async function issueLegacyOtp(user, channel) {
  if (channel === "phone") {
    if (!await reserveLegacyOtpRequest(Users, user._id)) return false;
    await sendOtpToPhone(user.phone);
    return true;
  }
  const otp = generateOtp();
  const hash = await bcrypt.hash(otp, 10);
  if (!await reserveLegacyOtpRequest(Users, user._id, { emailHash: hash })) return false;
  await sendOtpToEmail(user.email, otp);
  return true;
}

// ======================================
// LOGIN — legacy phone via Twilio Verify / email via SendGrid
// ======================================
const login = async (req, res) => {
  const { phone, email } = req.body || {};
  try {
    if (phone !== undefined && phone !== null && phone !== "") {
      if (typeof phone !== "string") return res.status(400).json({ error: "Invalid phone number" });
      const user = await findUniqueLegacyPhoneUser(phone);
      if (!user) return res.status(401).json({ error: "Phone number not found" });
      if (!await issueLegacyOtp(user, "phone")) {
        return res.status(429).json({ error: "Please wait before requesting another verification code." });
      }
      return res.status(200).json({ message: "OTP sent to your phone" });
    }
    if (email !== undefined && email !== null && email !== "") {
      if (typeof email !== "string") return res.status(400).json({ error: "Invalid email address" });
      const user = await Users.findOne({ email: email.trim().toLowerCase() });
      if (!user) return res.status(401).json({ error: "Email address not found" });
      if (!await issueLegacyOtp(user, "email")) {
        return res.status(429).json({ error: "Please wait before requesting another verification code." });
      }
      return res.status(200).json({ message: "OTP sent to your email" });
    }
    return res.status(400).json({ message: "Email or phone number is required" });
  } catch (error) {
    if (error?.code === "INVALID_PHONE_NUMBER") {
      return res.status(400).json({ error: "Invalid phone number. Use international format (+country code)." });
    }
    if (error?.code === "AMBIGUOUS_LEGACY_PHONE") {
      return res.status(409).json({ error: "Phone identity requires account review" });
    }
    console.error("Login OTP issue failed:", error.message);
    return res.status(503).json({ error: "Verification delivery unavailable. Try again later." });
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

            user = await findLegacyPhoneOtpUser(phone);
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
                // Only clear this exact expired code, never a newer code created
                // concurrently by the resend endpoint.
                await Users.updateOne(
                    {
                        _id: pending._id,
                        userotp: pending.userotp,
                        $or: [
                            { regTokenExpires: { $lte: new Date() } },
                            { regTokenExpires: { $exists: false } },
                        ],
                    },
                    {
                        $unset: { userotp: 1, regTokenExpires: 1 },
                        $set: { otpAttempts: 0 },
                    }
                );
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
        if (error?.code === "AMBIGUOUS_LEGACY_PHONE") {
      return res.status(409).json({ error: "Phone identity requires account review" });
    }
    console.error("verifyOtp error:", error.message);
        return res.status(500).json({ message: 'Something went wrong' });
    }

};

// ======================================
// RESEND OTP — phone via Verify / email via DIY
// ======================================
const requestNewCode = async (req, res) => {
  const { phone, email } = req.body || {};
  try {
    if (phone !== undefined && phone !== null && phone !== "") {
      if (typeof phone !== "string") return res.status(400).json({ error: "Invalid phone number" });
      const user = await findUniqueLegacyPhoneUser(phone);
      if (!user) return res.status(401).json({ message: "Invalid phone number" });
      if (!await issueLegacyOtp(user, "phone")) {
        return res.status(429).json({ message: "Please wait before requesting another code." });
      }
      return res.status(200).json({ message: "OTP has been resent to your phone" });
    }
    if (email !== undefined && email !== null && email !== "") {
      if (typeof email !== "string") return res.status(400).json({ error: "Invalid email address" });
      const user = await Users.findOne({ email: email.trim().toLowerCase() });
      if (!user) return res.status(401).json({ message: "Invalid email address" });
      if (!await issueLegacyOtp(user, "email")) {
        return res.status(429).json({ message: "Please wait before requesting another code." });
      }
      return res.status(200).json({ message: "OTP has been resent to your email" });
    }
    return res.status(400).json({ message: "Email or phone number is required" });
  } catch (error) {
    if (error?.code === "INVALID_PHONE_NUMBER") {
      return res.status(400).json({ error: "Invalid phone number. Use international format (+country code)." });
    }
    if (error?.code === "AMBIGUOUS_LEGACY_PHONE") {
      return res.status(409).json({ error: "Phone identity requires account review" });
    }
    console.error("Resend OTP issue failed:", error.message);
    return res.status(503).json({ error: "Verification delivery unavailable. Try again later." });
  }
};

const createUpmindSession = async (req, res) => {
  // This is a user-specific credential, not a cacheable customer identifier.
  res.set("Cache-Control", "private, no-store");
  if (!req.user?.id) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (!process.env.UPMIND_SECRET || process.env.UPMIND_SECRET.length < 32) {
    return res.status(503).json({ error: "Upmind session integration unavailable" });
  }
  try {
    const user = await Users.findById(req.user.id).select("+upmindClientId");
    if (!user || !user.upmindClientId) {
      return res.status(404).json({ error: "Upmind client not linked" });
    }

    // Legacy signed client exchange, only for the verified JWT session's user.
    // The existing provider-specific token payload is preserved until migration.
    const token = jwt.sign(
      { upmindId: user.upmindClientId, sub: String(user._id) },
      process.env.UPMIND_SECRET,
      { expiresIn: "5m" }
    );
    return res.json({ upmindToken: token });
  } catch (err) {
    console.error("Upmind session issuance unavailable:", err.message);
    return res.status(503).json({ error: "Upmind session integration unavailable" });
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





