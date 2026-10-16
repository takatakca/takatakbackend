"use strict";

const COOLDOWN_MS = 30_000;
const EMAIL_OTP_LIFETIME_MS = 5 * 60_000;

// MongoDB alone chooses the winner when multiple API workers request an OTP.
// A simple read/check/user.save() would let parallel sends bypass the cooldown.
async function reserveLegacyOtpRequest(User, userId, options = {}) {
  const { now = new Date(), emailHash = null } = options;
  if (!userId || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new TypeError("Invalid OTP reservation");
  }
  const cooldownBefore = new Date(now.getTime() - COOLDOWN_MS);
  const update = { lastOtpRequestedAt: now };
  if (emailHash !== null) {
    if (typeof emailHash !== "string" || !emailHash.length) {
      throw new TypeError("Invalid OTP hash");
    }
    update.userotp = emailHash;
    update.regTokenExpires = new Date(now.getTime() + EMAIL_OTP_LIFETIME_MS);
    update.otpAttempts = 0;
  }
  const result = await User.updateOne(
    {
      _id: userId,
      $or: [
        { lastOtpRequestedAt: null },
        { lastOtpRequestedAt: { $lte: cooldownBefore } },
      ],
    },
    { $set: update }
  );
  return result.matchedCount === 1;
}

module.exports = { COOLDOWN_MS, EMAIL_OTP_LIFETIME_MS, reserveLegacyOtpRequest };
