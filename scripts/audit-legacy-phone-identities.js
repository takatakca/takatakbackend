"use strict";
require("dotenv").config();
const mongoose = require("mongoose");
const Users = require("../models/User");

// These expressions run inside MongoDB. Neither a raw nor a canonical phone
// number leaves the database; only aggregate counts are returned.
// Uses MongoDB 4.4+ $replaceAll; validate server compatibility before use.
function canonicalPhoneExpression() {
  let compact = { $trim: {
    input: { $cond: [{ $eq: [{ $type: "$phone" }, "string"] }, "$phone", ""] },
  } };
  for (const separator of [" ", "-", ".", "(", ")", "\t"]) {
    compact = { $replaceAll: { input: compact, find: separator, replacement: "" } };
  }
  return {
    $let: {
      vars: { compact },
      in: {
        $switch: {
          branches: [
            // Canadian/US explicit country code with a valid NANP area-code start.
            { case: { $regexMatch: { input: "$$compact", regex: /^\+1[2-9]\d{9}$/ } }, then: "$$compact" },
            // Other explicit E.164 international numbers.
            { case: { $regexMatch: { input: "$$compact", regex: /^\+[2-9]\d{1,14}$/ } }, then: "$$compact" },
            // National ten-digit Canadian/US form.
            { case: { $regexMatch: { input: "$$compact", regex: /^[2-9]\d{9}$/ } }, then: { $concat: ["+1", "$$compact"] } },
            // Bare +1 and legacy bare +234 country-code forms.
            { case: { $regexMatch: { input: "$$compact", regex: /^1[2-9]\d{9}$/ } }, then: { $concat: ["+", "$$compact"] } },
            { case: { $regexMatch: { input: "$$compact", regex: /^234\d{10}$/ } }, then: { $concat: ["+", "$$compact"] } },
          ],
          // Missing, invalid, non-string and unsupported historic forms must
          // block declaring the index migration safe, not become a real number.
          default: null,
        },
      },
    },
  };
}

// Count canonical duplicates, not just raw string duplicates: different saved
// spellings (e.g. 5145550184 vs +15145550184) represent the same identity.
// MongoDB never returns the canonical group keys to the application.
function phoneCollisionPipeline() {
  return [
    { $project: { canonicalPhone: canonicalPhoneExpression() } },
    { $group: { _id: "$canonicalPhone", count: { $sum: 1 } } },
    { $group: {
      _id: null,
      totalAccounts: { $sum: "$count" },
      distinctPhoneValues: { $sum: { $cond: [{ $eq: ["$_id", null] }, 0, 1] } },
      collisionGroups: { $sum: { $cond: [{
        $and: [{ $ne: ["$_id", null] }, { $gt: ["$count", 1] }],
      }, 1, 0] } },
      collisionAccounts: { $sum: { $cond: [{
        $and: [{ $ne: ["$_id", null] }, { $gt: ["$count", 1] }],
      }, "$count", 0] } },
      invalidPhoneAccounts: { $sum: { $cond: [{ $eq: ["$_id", null] }, "$count", 0] } },
    } },
    { $project: {
      _id: 0,
      totalAccounts: 1,
      distinctPhoneValues: 1,
      collisionGroups: 1,
      collisionAccounts: 1,
      invalidPhoneAccounts: 1,
    } },
  ];
}

function assessPhoneIdentityAudit(aggregated, indexes = []) {
  if (!Array.isArray(aggregated) || aggregated.length > 1 || !Array.isArray(indexes)) {
    throw new TypeError("Invalid legacy phone identity audit results");
  }
  const stats = aggregated[0] || {
    totalAccounts: 0, distinctPhoneValues: 0, collisionGroups: 0,
    collisionAccounts: 0, invalidPhoneAccounts: 0,
  };
  const fields = [
    "totalAccounts", "distinctPhoneValues", "collisionGroups",
    "collisionAccounts", "invalidPhoneAccounts",
  ];
  if (fields.some(field => !Number.isSafeInteger(stats[field]) || stats[field] < 0) ||
      stats.invalidPhoneAccounts > stats.totalAccounts ||
      stats.distinctPhoneValues > stats.totalAccounts - stats.invalidPhoneAccounts ||
      stats.collisionGroups > stats.distinctPhoneValues ||
      stats.collisionAccounts > stats.totalAccounts - stats.invalidPhoneAccounts ||
      (stats.collisionGroups === 0 && stats.collisionAccounts !== 0) ||
      (stats.collisionGroups > 0 && stats.collisionAccounts < stats.collisionGroups * 2)) {
    throw new TypeError("Inconsistent phone audit counts");
  }

  const uniqueIndex = indexes.some(index =>
    index?.unique === true &&
    index.key && Object.keys(index.key).length === 1 &&
    index.key.phone === 1 &&
    !index.partialFilterExpression && !index.sparse &&
    !index.collation // a non-simple collation needs separate review
  );
  const collisionFree = stats.collisionGroups === 0;
  return {
    totalAccounts: stats.totalAccounts,
    distinctPhoneValues: stats.distinctPhoneValues,
    collisionGroups: stats.collisionGroups,
    collisionAccounts: stats.collisionAccounts,
    invalidPhoneAccounts: stats.invalidPhoneAccounts,
    phoneUniqueIndexPresent: uniqueIndex,
    healthy: collisionFree && stats.invalidPhoneAccounts === 0 && uniqueIndex,
    nextAction: !collisionFree
      ? "Review canonical duplicate legacy phone ownership before enabling a unique index."
      : stats.invalidPhoneAccounts > 0
        ? "Review invalid or missing historic phone values before declaring account identity ready."
        : !uniqueIndex
          ? "No canonical collisions counted; validate normalizer/database versions, backup and ownership before separately creating a unique index."
          : "No canonical duplicate or invalid phone identities detected; a full unique phone index is present.",
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
module.exports = {
  canonicalPhoneExpression, phoneCollisionPipeline, assessPhoneIdentityAudit,
};
