"use strict";
const crypto = require("node:crypto");

// Server-to-server API keys must not depend on the spoofable Origin header.
function verifyApiKey(req, res, next) {
  const secret = process.env.TAKATAK_API_KEY;
  const supplied = req.headers["x-api-key"];
  if (typeof secret !== "string" || !secret ||
      typeof supplied !== "string" || !supplied) {
    return res.status(403).json({ error: "Access denied" });
  }
  const received = Buffer.from(supplied, "utf8");
  const expected = Buffer.from(secret, "utf8");
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) {
    return res.status(403).json({ error: "Access denied" });
  }
  next();
}

module.exports = verifyApiKey;
