"use strict";
require("dotenv").config();
const mongoose = require("mongoose");
const Users = require("../models/User");

// Never emit, store in logs, or export personal phone numbers from this audit.
// The first group runs within MongoDB; only aggregate counts leave the server.
function phoneCollisionPipeline() {
  return [
    { $group: { _id: "$phone", count: { $sum: 1 } } },
    { $group: {
      _id: null,
      totalAccounts: { $sum: "$count" },
      distinctPhoneValues: { $sum: 1 },
      collisionGroups: { $sum: { $cond: [{ $gt: ["$count", 1] }, 1, 0] } },
      collisionAccounts: { $sum: { $cond: [{ $gt: ["$count", 1] }, "$count", 0] } },
    } },
    { $project: { _id: 0, totalAccounts: 1, distinctPhoneValues: 1,
      collisionGroups: 1, collisionAccounts: 1 } },
  ];
}

function assessPhoneIdentityAudit(aggregated, indexes = []) {
  if (!Array.isArray(aggregated) || aggregated.length > 1 || !Array.isArray(indexes)) {
    throw new TypeError("Invalid legacy phone identity audit results");
  }
  const stats = aggregated[0] || {
    totalAccounts: 0, distinctPhoneValues: 0,
    collisionGroups: 0, collisionAccounts: 0,
  };
  const fields = ["totalAccounts", "distinctPhoneValues", "collisionGroups", "collisionAccounts"];
  if (fields.some(field => !Number.isSafeInteger(stats[field]) || stats[field] < 0) ||
      stats.distinctPhoneValues > stats.totalAccounts ||
      stats.collisionGroups > stats.distinctPhoneValues ||
      stats.collisionAccounts > stats.totalAccounts ||
      (stats.collisionGroups === 0 && stats.collisionAccounts !== 0) ||
      (stats.collisionGroups > 0 && stats.collisionAccounts < stats.collisionGroups * 2)) {
    throw new TypeError("Inconsistent phone audit counts");
  }
  const uniqueIndex = indexes.some(index =>
    index?.unique === true &&
    index.key && Object.keys(index.key).length === 1 &&
    index.key.phone === 1 &&
    !index.partialFilterExpression && !index.sparse
  );
  const collisionFree = stats.collisionGroups === 0;
  return {
    totalAccounts: stats.totalAccounts,
    distinctPhoneValues: stats.distinctPhoneValues,
    collisionGroups: stats.collisionGroups,
    collisionAccounts: stats.collisionAccounts,
    phoneUniqueIndexPresent: uniqueIndex,
    healthy: collisionFree && uniqueIndex,
    nextAction: !collisionFree
      ? "Review and reconcile duplicate legacy phone ownership before enabling a unique index."
      : !uniqueIndex
        ? "No collisions counted; verify phone format and authorized backup before separately adding a unique index."
        : "No duplicate phone identities detected and a full unique phone index is present.",
  };
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error("Phone identity audit requires MONGO_URI in the authorized environment");
    process.exitCode = 1;
    return;
  }
  try {
    // Read-only audit. Do not let model initialization create new indexes.
    mongoose.set("autoIndex", false);
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      autoIndex: false,
    });
    const aggregate = await Users.collection.aggregate(phoneCollisionPipeline()).toArray();
    const indexes = await Users.collection.indexes();
    const result = assessPhoneIdentityAudit(aggregate, indexes);
    console.log(JSON.stringify(result, null, 2));
    if (!result.healthy) process.exitCode = 2;
  } catch (err) {
    // No connection strings, individual phone numbers or raw database errors.
    console.error("Read-only phone identity audit unavailable:", err.name || "connection error");
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}
if (require.main === module) main();
module.exports = { phoneCollisionPipeline, assessPhoneIdentityAudit };
