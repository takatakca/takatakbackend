"use strict";

const MAX_EMAIL_OTP_ATTEMPTS = 5;

// Reserve one attempt atomically before expensive bcrypt comparison. A missing
// counter on a legacy document is treated as zero. Concurrent requests cannot
// exceed the limit or bypass the expiration predicate.
async function reserveEmailOtpAttempt(User, user, now = new Date()) {
  return User.findOneAndUpdate(
    {
      _id: user._id,
      userotp: user.userotp,
      regTokenExpires: { $gt: now },
      $or: [{ otpAttempts: { $lt: MAX_EMAIL_OTP_ATTEMPTS } }, { otpAttempts: { $exists: false } }],
    },
    { $inc: { otpAttempts: 1 } },
    { new: true }
  ).select("+userotp +encryptedPassword +otpAttempts");
}

// Consume the verified code once. Simultaneous correct submissions race on
// userotp and only one can create an authenticated session.
async function consumeEmailOtp(User, user, now = new Date()) {
  const action = user.isVerified ? "login" : "register";
  return User.findOneAndUpdate(
    { _id: user._id, userotp: user.userotp, regTokenExpires: { $gt: now } },
    {
      $unset: { userotp: 1, regTokenExpires: 1 },
      $set: {
        isVerified: true,
        verifiedAt: now,
        lastAction: action,
        lastActionAt: now,
        otpAttempts: 0,
      },
      $push: { activity: { action, at: now } },
    },
    { new: true }
  ).select("+encryptedPassword +upmindClientId");
}

module.exports = { MAX_EMAIL_OTP_ATTEMPTS, reserveEmailOtpAttempt, consumeEmailOtp };
