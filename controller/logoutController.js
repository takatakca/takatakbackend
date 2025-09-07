const Session = require("../models/Session");

async function logoutHandler(req, res) {
  try {
    const sid = req.cookies?.sid || req.body.sid;
    if (sid) {
      await Session.findByIdAndDelete(sid);
    }
    res.clearCookie("sid");
    res.clearCookie("refresh_token");
    return res.json({ ok: true });
  } catch (err) {
    console.error("logout error", err);
    return res.status(500).json({ error: "Internal error" });
  }
}

module.exports = { logoutHandler };
