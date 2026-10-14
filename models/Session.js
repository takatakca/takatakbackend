const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // UUID v4 session ID
  // Matches the actual model name registered by models/User.js.
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "Users", required: true },
  refreshHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  lastActivity: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, expires: 0 },
  revoked: { type: Boolean, default: false },
  deviceInfo: { type: String },
  ip: { type: String },
});

module.exports = mongoose.model("Session", SessionSchema);
