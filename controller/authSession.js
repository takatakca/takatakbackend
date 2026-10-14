"use strict";
const { v4: uuidv4 } = require("uuid");
const Session = require("../models/Session");
const { randomToken, hashToken } = require("../utils/tokenHelpers");
const jwt = require("jsonwebtoken");
const fs = require("node:fs");

const configuredDays = Number.parseInt(process.env.REFRESH_TTL_DAYS || "30", 10);
const REFRESH_TTL_DAYS = Number.isInteger(configuredDays) && configuredDays > 0 ? configuredDays : 30;
const REFRESH_MAX_AGE = REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;
const ACCESS_TTL = process.env.ACCESS_TTL || "1h";

async function createSessionAndSetCookies(user, req, res) {
  if (!process.env.PRIVATE_KEY_PATH) {
    throw new Error("PRIVATE_KEY_PATH is not configured");
  }
  // Validate signing before storing a session, so bad deployment configuration
  // cannot leave zombie sessions behind.
  const privateKey = fs.readFileSync(process.env.PRIVATE_KEY_PATH, "utf8");
  const sid = uuidv4();
  const refreshToken = randomToken(48);
  const now = new Date();
  const accessToken = jwt.sign(
    { sub: String(user._id), sid, role: user.role, email: user.email },
    privateKey,
    { algorithm: "RS256", expiresIn: ACCESS_TTL, issuer: process.env.ISSUER || "https://takatak.ca" }
  );

  await Session.create({
    _id: sid,
    userId: user._id,
    refreshHash: hashToken(refreshToken),
    createdAt: now,
    lastActivity: now,
    expiresAt: new Date(now.getTime() + REFRESH_MAX_AGE),
    deviceInfo: req.headers["user-agent"] || "",
    ip: req.ip || req.socket?.remoteAddress || "",
  });

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REFRESH_MAX_AGE,
  };
  res.cookie("sid", sid, cookieOptions);
  res.cookie("refresh_token", refreshToken, cookieOptions);
  res.set("Cache-Control", "no-store");
  return { accessToken, sid };
}

module.exports = { createSessionAndSetCookies };
