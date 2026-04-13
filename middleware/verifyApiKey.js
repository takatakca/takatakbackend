require("dotenv").config();

const allowedOrigins = [
  "http://localhost:3000",          // Local frontend
  "http://localhost:3001",       //local backend
  "https://takatak.ca",        // Production frontend
  "https://www.takatak.ca"
];

const verifyApiKey = (req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) {
    console.log("Bypassing API key check (no origin header)");
    return next();
  }
  const clientKey = req.headers["x-api-key"];

  // if (allowedOrigins.includes(origin)) {
  //   return next();
  // }
  if (allowedOrigins.some(o => origin && origin.startsWith(o))) {
    return next();
  }

  if (!clientKey || clientKey !== process.env.TAKATAK_API_KEY) {
    console.error("Invalid API key:", {
      origin: req.headers.origin,
      key: req.headers["x-api-key"]
    });
    return res.status(403).json({ message: "Access denied. Please try again or contact support." });
  }

  next();
};

module.exports = verifyApiKey;
