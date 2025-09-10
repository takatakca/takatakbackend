// models/Session.js
const mongoose = require("mongoose");

const SessionSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // use UUID v4 as id (sid)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  refreshHash: { type: String, required: true },
  createdAt: { type: Date, default: () => new Date(), expires: "7d" }, // auto-expire after 7 days
  lastActivity: { type: Date, default: () => new Date() },
  expiresAt: { type: Date, required: true }, // refresh expiry
  revoked: { type: Boolean, default: false },
  deviceInfo: { type: String },
  ip: { type: String },
});

module.exports = mongoose.model("Session", SessionSchema);
