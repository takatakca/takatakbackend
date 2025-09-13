const crypto = require("crypto");

const ALGO = "aes-256-gcm";
const IV_LENGTH = 16; // 128-bit IV
const SECRET = process.env.PASSWORD_ENCRYPT_SECRET; // must be 32 bytes (hex string)

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, Buffer.from(SECRET, "hex"), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted.toString("hex");
}

function decrypt(enc) {
  const [ivHex, tagHex, dataHex] = enc.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const encryptedText = Buffer.from(dataHex, "hex");

  const decipher = crypto.createDecipheriv(ALGO, Buffer.from(SECRET, "hex"), iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString("utf8");
}

module.exports = { encrypt, decrypt };