"use strict";
const fs = require("node:fs");
const jwt = require("jsonwebtoken");
const Session = require("../models/Session");
const User = require("../models/User");
const { getCredential } = require("../utils/requestCredentials");
const { verifyTokenHash, randomToken, hashToken } = require("../utils/tokenHelpers");

const ACCESS_TTL = process.env.ACCESS_TTL || "1h";
const configuredDays = Number.parseInt(process.env.REFRESH_TTL_DAYS || "30", 10);
const REFRESH_TTL_DAYS = Number.isInteger(configuredDays) && configuredDays > 0 ? configuredDays : 30;
const refreshMaxAge = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
};

async function refreshTokenHandler(req, res) {
  try {
    // Refresh must work even after the short-lived access JWT has expired.
    const sid = getCredential(req, "sid");
    const token = getCredential(req, "refresh_token");
    if (typeof sid !== "string" || !/^[0-9a-f-]{36}$/i.test(sid) ||
        typeof token !== "string" || token.length > 256) {
      return res.status(401).json({ error: "Invalid refresh credentials" });
    }

    const session = await Session.findById(sid);
    if (!session || session.revoked) {
      return res.status(401).json({ error: "Invalid session" });
    }

    const now = new Date();
    if (session.expiresAt <= now) {
      await Session.deleteOne({ _id: sid, expiresAt: { $lte: now } });
      res.clearCookie("sid", cookieOptions);
      res.clearCookie("refresh_token", cookieOptions);
      return res.status(401).json({ error: "Session expired" });
    }

    // Validate the opaque secret first, before inspecting the user record.
    // A guessed SID must not reveal whether its account exists or is verified.
    if (!(await verifyTokenHash(token, session.refreshHash))) {
      // Never let an incorrect token revoke someone else's session.
      return res.status(401).json({ error: "Invalid refresh credentials" });
    }

    // A valid refresh secret does not authorize a deleted or disabled account.
    const user = await User.findById(session.userId).select("isVerified");
    if (!user || !user.isVerified) {
      return res.status(401).json({ error: "User not active" });
    }

    // Sign before mutating the database. Invalid signing configuration must
    // not consume the user's existing valid refresh token.
    if (!process.env.PRIVATE_KEY_PATH) throw new Error("PRIVATE_KEY_PATH is not configured");
    const privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH, "utf8");
    const accessToken = jwt.sign(
      { sub: String(session.userId), sid: session._id },
      privateKey,
      { algorithm: "RS256", keyid: process.env.JWT_KEY_ID || "takatak-key", expiresIn: ACCESS_TTL, issuer: process.env.ISSUER || "https://takatak.ca" }
    );
    const newRefreshToken = randomToken(48);
    const nextHash = hashToken(newRefreshToken);

    // Compare-and-swap prevents two requests from silently overwriting one another.
    const rotated = await Session.findOneAndUpdate(
      { _id: sid, revoked: false, refreshHash: session.refreshHash, expiresAt: { $gt: now } },
      { $set: { refreshHash: nextHash, lastActivity: now, expiresAt: new Date(now.getTime() + refreshMaxAge) } },
      { new: true }
    );
    if (!rotated) {
      return res.status(401).json({ error: "Session already rotated or expired" });
    }

    res.cookie("sid", rotated._id, { ...cookieOptions, maxAge: refreshMaxAge });
    res.cookie("refresh_token", newRefreshToken, { ...cookieOptions, maxAge: refreshMaxAge });
    res.set("Cache-Control", "no-store");
    return res.json({ accessToken });
  } catch (err) {
    console.error("Refresh failed:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { refreshTokenHandler };
