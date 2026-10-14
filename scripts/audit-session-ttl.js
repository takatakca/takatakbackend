"use strict";
require("dotenv").config();
const mongoose = require("mongoose");

// This audit never creates or deletes indexes or modifies customer data.
function assessSessionIndexes(indexes) {
  if (!Array.isArray(indexes)) throw new TypeError("Expected MongoDB index array");

  const correct = indexes.find(i =>
    i.key && Object.keys(i.key).length === 1 && i.key.expiresAt === 1 &&
    i.expireAfterSeconds === 0
  );
  const oldTtl = indexes.filter(i =>
    i.key && Object.keys(i.key).length === 1 && i.key.createdAt === 1 &&
    Number.isFinite(i.expireAfterSeconds) && i.expireAfterSeconds >= 0
  );
  return {
    healthy: Boolean(correct) && oldTtl.length === 0,
    expiresAtTtlPresent: Boolean(correct),
    obsoleteCreatedAtTtlIndexes: oldTtl.map(i => i.name || "(unnamed)"),
    recommendation: !correct
      ? "Create expiresAt TTL with expireAfterSeconds: 0 after reviewing the correct database and backup."
      : oldTtl.length
        ? "After backup and verification, remove only the obsolete createdAt TTL index by verified name."
        : "No session TTL index migration is needed.",
  };
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("Session TTL audit requires MONGO_URI in the authorized environment");
    process.exitCode = 1;
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    const indexes = await mongoose.connection.db.collection("sessions").indexes();
    const result = assessSessionIndexes(indexes);
    console.log(JSON.stringify(result, null, 2));
    if (!result.healthy) process.exitCode = 2;
  } catch (err) {
    console.error("Read-only session TTL audit could not complete:", err.name || "connection error");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

if (require.main === module) main();
module.exports = { assessSessionIndexes };
