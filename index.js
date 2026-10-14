"use strict";
// Load environment configuration BEFORE loading auth and database modules.
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const connectdb = require("./config/connectDb");
const router = require("./routes/handler");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));

// CORS is a browser safeguard, not an authentication mechanism.
// Deployments using other TAKATAK frontends must list those exact origins.
const origins = (process.env.CORS_ORIGINS || "https://takatak.ca,https://www.takatak.ca")
  .split(",")
  .map(origin => origin.trim())
  .filter(Boolean);
if (process.env.NODE_ENV !== "production") {
  origins.push("http://localhost:3000", "http://localhost:3001");
}
const allowedOrigins = new Set(origins);
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || allowedOrigins.has(origin));
  },
  credentials: true,
}));

// Load balancers can probe liveness independently of database readiness.
app.get("/health/live", (_req, res) => res.json({ status: "ok" }));
app.get("/health/ready", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready" });
});

app.use("/", router);

async function start() {
  // Do not accept traffic before the database is connected.
  await connectdb();
  const port = Number.parseInt(process.env.PORT || "3000", 10);
  const server = app.listen(port, "0.0.0.0", () => {
    console.log(`TAKATAK backend listening on port ${port}`);
  });
  return server;
}

if (require.main === module) {
  start().catch(err => {
    console.error("Backend startup failed:", err.message);
    process.exitCode = 1;
  });
}

module.exports = { app, start };
