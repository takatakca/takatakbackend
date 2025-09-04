// utils/tokenHelpers.js
const crypto = require("crypto");
const bcrypt = require("bcrypt");

const randomToken = (size = 48) => crypto.randomBytes(size).toString("hex"); // ~96 chars
const hashToken = async (token) => await bcrypt.hash(token, 12);
const verifyTokenHash = async (token, hash) => await bcrypt.compare(token, hash);

module.exports = { randomToken, hashToken, verifyTokenHash };
