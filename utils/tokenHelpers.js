// utils/tokenHelpers.js
const crypto = require("crypto");
const bcrypt = require("bcrypt");

function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function verifyTokenHash(token, hashed) {
  return bcrypt.compare(token, hashed);
}
module.exports = { randomToken, hashToken, verifyTokenHash };
