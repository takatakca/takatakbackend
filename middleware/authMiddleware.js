"use strict";
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const path = require("node:path");

function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (typeof header !== "string" || !/^Bearer\s+\S+$/i.test(header)) {
      return res.status(401).json({ error: "No valid bearer token provided" });
    }
    const keyPath = process.env.PUBLIC_KEY_PATH || path.join(__dirname, "..", "keys", "public.pem");
    const publicKey = fs.readFileSync(keyPath, "utf8");
    const payload = jwt.verify(header.replace(/^Bearer\s+/i, ""), publicKey, {
      algorithms: ["RS256"],
      issuer: process.env.ISSUER || "https://takatak.ca",
    });
    if (!payload.sub || !payload.sid) {
      return res.status(401).json({ error: "Invalid session token" });
    }
    req.user = { id: payload.sub, sid: payload.sid, role: payload.role, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authMiddleware;
