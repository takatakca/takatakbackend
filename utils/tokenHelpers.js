"use strict";
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");

// Refresh tokens are opaque random credentials. Store only their SHA-256 digest.
function randomToken(bytes = 32) {
  if (!Number.isInteger(bytes) || bytes < 32 || bytes > 128) {
    throw new RangeError("Token size must be between 32 and 128 bytes");
  }
  return crypto.randomBytes(bytes).toString("hex");
}

function hashToken(token) {
  if (typeof token !== "string" || token.length === 0) {
    throw new TypeError("Refresh token must be a nonempty string");
  }
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function verifyTokenHash(token, hashed) {
  if (typeof token !== "string" || typeof hashed !== "string") return false;

  // Keep existing bcrypt session hashes readable during the migration.
  if (/^\$2[aby]\$\d\d\$/.test(hashed)) {
    return bcrypt.compare(token, hashed);
  }

  if (!/^[a-f0-9]{64}$/i.test(hashed)) return false;
  const calculated = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(hashed, "hex");
  return crypto.timingSafeEqual(calculated, expected);
}

module.exports = { randomToken, hashToken, verifyTokenHash };
