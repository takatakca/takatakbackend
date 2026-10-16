"use strict";
const { normalizePhone } = require("./phoneUtils");
const Users = require("../models/User");

class AmbiguousLegacyPhoneError extends Error {
  constructor() {
    super("Multiple legacy accounts share one phone number; account review required");
    this.code = "AMBIGUOUS_LEGACY_PHONE";
  }
}

// Historical records may contain duplicate phone numbers: unlike email,
// the phone field has no unique MongoDB index. An arbitrary findOne() is
// unsafe for a Twilio Verify assertion: the OTP proves the phone, not which
// of two accounts owns it. Limit reads to two and refuse ambiguous identity.
async function findUniqueLegacyPhoneUser(phone, { withUpmind = false } = {}) {
  const storedPhone = normalizePhone(phone);
  const selection = withUpmind
    ? "+encryptedPassword +upmindClientId"
    : "_id phone email";
  const matching = await Users.find({ phone: storedPhone })
    .limit(2)
    .select(selection);
  if (!Array.isArray(matching)) {
    throw new Error("Legacy phone identity lookup unavailable");
  }
  if (matching.length > 1) throw new AmbiguousLegacyPhoneError();
  return matching[0] || null;
}

// Verification must also load the hidden existing Upmind linkage so the
// legacy sign-in does not create a duplicate external client.
function findLegacyPhoneOtpUser(phone) {
  return findUniqueLegacyPhoneUser(phone, { withUpmind: true });
}

module.exports = {
  AmbiguousLegacyPhoneError,
  findUniqueLegacyPhoneUser,
  findLegacyPhoneOtpUser,
};
