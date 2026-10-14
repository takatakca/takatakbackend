"use strict";
const jwt = require("jsonwebtoken");
const fs = require("node:fs");
const path = require("node:path");
const Session = require("../models/Session");
const User = require("../models/User");

// The repository's former RS256 private signing key is publicly exposed.
// Until coordinated rotation, a signature alone MUST NOT grant API access.
// Require an active, server-side session tied to the token subject and use
// the database role rather than trusting claims that can be forged.
async function authMiddleware(req, res, next) {
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
    if (typeof payload.sub !== "string" ||
        typeof payload.sid !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sid)) {
      return res.status(401).json({ error: "Invalid session token" });
    }

    const session = await Session.findOne({
      _id: payload.sid,
      userId: payload.sub,
      revoked: false,
      expiresAt: { $gt: new Date() },
    }).select("_id");
    if (!session) {
      return res.status(401).json({ error: "Session not active" });
    }

    const user = await User.findById(payload.sub).select("role email");
    if (!user || !user.isVerified) {
      return res.status(401).json({ error: "User not active" });
    }

    req.user = {
      id: String(user._id),
      sid: payload.sid,
      role: user.role,
      email: user.email,
    };
    return next();
  } catch (err) {
    // Do not reveal JWT or database identifiers to the caller.
    if (err.name !== "JsonWebTokenError" && err.name !== "TokenExpiredError" &&
        err.name !== "NotBeforeError" && err.name !== "CastError") {
      console.error("Authentication check failed:", err.message);
    }
    return res.status(401).json({ error: "Invalid or expired session" });
  }
}

module.exports = authMiddleware;
