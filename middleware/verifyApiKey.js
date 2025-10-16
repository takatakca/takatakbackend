require("dotenv").config();

const allowedOrigins = [
  "http://localhost:3000",          // Local frontend
  "https://takatak.ca/" // Production frontend
];

const verifyApiKey = (req, res, next) => {
  const origin = req.headers.origin;
  const clientKey = req.headers["x-api-key"];

  if (allowedOrigins.includes(origin)) {
    return next();
  }

  if (!clientKey || clientKey !== process.env.TAKATAK_API_KEY) {
    return res.status(403).json({ message: "Forbidden: Invalid API key" });
  }

  next();
};

module.exports = verifyApiKey;
