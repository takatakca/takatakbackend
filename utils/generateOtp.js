"use strict";
const { randomInt } = require("node:crypto");

// Cryptographically strong six-digit legacy email OTP. The old Math.random()
// implementation was predictable enough to be unsuitable for authentication.
function generateOtp() {
  return String(randomInt(100000, 1000000));
}

module.exports = generateOtp;
