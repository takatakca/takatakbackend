const jwt = require("jsonwebtoken");
const fs = require("fs");
const PUBLIC_KEY = fs.readFileSync(process.env.PUBLIC_KEY_PATH, "utf8");

module.exports = function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: "No token" });

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, PUBLIC_KEY, { algorithms: ["RS256"], issuer: process.env.ISSUER });
    // payload.sub contains userId, payload.sid contains session id
    req.user = { id: payload.sub, sid: payload.sid };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};
