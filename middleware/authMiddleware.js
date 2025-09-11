const jwt = require("jsonwebtoken");
const fs = require("fs");
const PUBLIC_KEY = fs.readFileSync("./keys/public.pem", "utf8");

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, PUBLIC_KEY, {
      algorithms: ["RS256"],
      issuer: process.env.ISSUER,
    });

    // Attach user info from JWT (no DB call here)
    req.user = { id: payload.sub, sid: payload.sid, role: payload.role, email: payload.email  };
    next();
  } catch (err) {
    console.error("Auth error:", err.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authMiddleware;