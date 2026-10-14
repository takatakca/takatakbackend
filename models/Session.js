const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UUID v4 session ID
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  refreshHash: { type: String, required: true },
  // Do not expire sessions after a fixed 7 days: the refresh policy is 30 days.
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  // MongoDB TTL removal follows the actual refresh expiry.
  expiresAt: { type: Date, required: true, expires: 0 },
  revoked: { type: Boolean, default: false },
  deviceInfo: { type: String },
  ip: { type: String },
});

module.exports = mongoose.model("Session", SessionSchema);
