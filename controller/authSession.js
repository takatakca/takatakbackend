
const { v4: uuidv4 } = require("uuid");
const Session = require("../models/Session");
const { randomToken, hashToken } = require("../utils/tokenHelpers");
const jwt = require("jsonwebtoken");
const fs = require("fs");

const PRIVATE_KEY = fs.readFileSync(process.env.PRIVATE_KEY_PATH, "utf8");

// config
const REFRESH_TTL_DAYS = process.env.REFRESH_TTL_DAYS ? parseInt(process.env.REFRESH_TTL_DAYS) : 30;
const ACCESS_TTL = process.env.ACCESS_TTL || "1h";

async function createSessionAndSetCookies(user, req, res) {
  // create session id and refresh token
  const sid = uuidv4();
  const refreshToken = randomToken(48);
  const refreshHash = await hashToken(refreshToken);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  await Session.create({
    _id: sid,
    userId: user._id,
    refreshHash,
    createdAt: now,
    lastActivity: now,
    expiresAt,
    deviceInfo: req.headers["user-agent"] || "",
    ip: req.ip || req.connection.remoteAddress,
  });

  // set cookies (httpOnly)
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    // consider setting domain if you want cross-subdomain cookies; otherwise omit.
    maxAge: REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
  };
  res.cookie("sid", sid, cookieOptions);
  res.cookie("refresh_token", refreshToken, cookieOptions);

  // issue access token signed RS256
  const accessToken = jwt.sign(
    { 
      sub: String(user._id),
       sid,
       role: user.role,
       email: user.email  
    },
    PRIVATE_KEY,
    { algorithm: "RS256", expiresIn: ACCESS_TTL, issuer: process.env.ISSUER || "https://takatak.ca" }
  );

  return { accessToken, sid };
}

module.exports = { createSessionAndSetCookies };
