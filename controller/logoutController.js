"use strict";
const Session = require("../models/Session");

async function logoutHandler(req, res) {
  try {
    // Trust only the verified JWT: never delete the SID supplied by another client.
    const { id, sid } = req.user || {};
    if (!id || !sid) {
      return res.status(401).json({ error: "Invalid session" });
    }
    await Session.deleteOne({ _id: sid, userId: id });
    const options = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    };
    res.clearCookie("sid", options);
    res.clearCookie("refresh_token", options);
    res.set("Cache-Control", "no-store");
    return res.json({ ok: true });
  } catch (err) {
    console.error("Logout failed:", err.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = { logoutHandler };
