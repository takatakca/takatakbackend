"use strict";
const { normalizePhone } = require("./phoneUtils");
const Users = require("../models/User");

// The Upmind association and legacy temporary credential are select:false.
// OTP sign-in must explicitly retrieve the existing association, or a linked
// customer can be silently treated as unlinked and provisioned twice.
function findLegacyPhoneOtpUser(phone) {
  return Users.findOne({ phone: normalizePhone(phone) })
    .select("+encryptedPassword +upmindClientId");
}

module.exports = { findLegacyPhoneOtpUser };
