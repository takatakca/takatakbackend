"use strict";
const crypto = require("node:crypto");

const ALGO = "aes-256-gcm";
const IV_LENGTH = 16; // Keep the legacy wire format unchanged for stored values.

function getEncryptionKey(env = process.env) {
  const secret = env.PASSWORD_ENCRYPT_SECRET;
  if (typeof secret !== "string" || !/^[0-9a-f]{64}$/i.test(secret)) {
    throw new Error("PASSWORD_ENCRYPT_SECRET must be a 32-byte hex secret");
  }
  return Buffer.from(secret, "hex");
}

function encrypt(text) {
  if (typeof text !== "string" || !text) {
    throw new TypeError("Encrypted text must be a nonempty string");
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Existing documents use ivHex:tagHex:ciphertextHex; preserve compatibility.
  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + ciphertext.toString("hex");
}

function decrypt(serialized) {
  if (typeof serialized !== "string") {
    throw new TypeError("Invalid encrypted credential");
  }
  const parts = serialized.split(":");
  if (parts.length !== 3 ||
      !/^[0-9a-f]{32}$/i.test(parts[0]) ||
      !/^[0-9a-f]{32}$/i.test(parts[1]) ||
      !/^(?:[0-9a-f]{2})+$/i.test(parts[2])) {
    throw new TypeError("Invalid encrypted credential");
  }
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");

  const decipher = crypto.createDecipheriv(ALGO, getEncryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

module.exports = { encrypt, decrypt, getEncryptionKey };
