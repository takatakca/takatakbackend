const Session = require("../models/Session");
const { verifyTokenHash, randomToken, hashToken } = require("../utils/tokenHelpers");
const jwt = require("jsonwebtoken");
const fs = require("fs");

const PRIVATE_KEY = fs.readFileSync(process.env.PRIVATE_KEY_PATH, "utf8");
const ACCESS_TTL = process.env.ACCESS_TTL || "1h";
const REFRESH_TTL_DAYS = process.env.REFRESH_TTL_DAYS ? parseInt(process.env.REFRESH_TTL_DAYS) : 30;

async function refreshTokenHandler(req, res) {
  try {
    const sid = req.cookies?.sid || req.body.sid;
    const providedToken = req.cookies?.refresh_token || req.body.refresh_token;

    if (!sid || !providedToken) return res.status(401).json({ error: "No refresh credentials" });

    const session = await Session.findById(sid);
    if (!session || session.revoked) {
      return res.status(401).json({ error: "Invalid session" });
    }

    // expired refresh
    if (new Date() > new Date(session.expiresAt)) {
      // clean up
      await Session.findByIdAndDelete(sid);
      res.clearCookie("sid");
      res.clearCookie("refresh_token");
      return res.status(401).json({ error: "Session expired" });
    }

    const tokenMatches = await verifyTokenHash(providedToken, session.refreshHash);
    if (!tokenMatches) {
      // possible token theft - revoke this session (or optionally revoke all sessions)
      session.revoked = true;
      await session.save();
      res.clearCookie("sid");
      res.clearCookie("refresh_token");
      return res.status(401).json({ error: "Refresh token reuse detected. Session revoked." });
    }

    // rotate refresh token: issue new token and replace stored hash
    const newRefreshToken = randomToken(48);
    const newHash = await hashToken(newRefreshToken);
    session.refreshHash = newHash;
    session.lastActivity = new Date();
    // extend expiry optionally
    session.expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);
    await session.save();

    // set new cookie values
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
    };
    res.cookie("sid", session._id, cookieOptions);
    res.cookie("refresh_token", newRefreshToken, cookieOptions);

    // issue new access token
    const accessToken = jwt.sign(
      { sub: String(session.userId), sid: session._id },
      PRIVATE_KEY,
      { algorithm: "RS256", expiresIn: ACCESS_TTL, issuer: process.env.ISSUER || "https://takatak.ca" }
    );

    return res.json({ accessToken });
  } catch (err) {
    console.error("refresh error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { refreshTokenHandler };
