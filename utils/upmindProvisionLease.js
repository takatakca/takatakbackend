"use strict";
const { randomUUID } = require("node:crypto");

const DEFAULT_LEASE_MS = 2 * 60 * 1000;

// A short-lived MongoDB compare-and-set lease serializes Upmind client POSTs
// for one local user across API instances. No new master identity is created.
async function acquireProvisionLease(Model, userId, now = new Date(), ttlMs = DEFAULT_LEASE_MS) {
  if (!userId || !(now instanceof Date) || !Number.isFinite(now.getTime()) ||
      !Number.isSafeInteger(ttlMs) || ttlMs < 1000) {
    throw new TypeError("Invalid Upmind lease arguments");
  }
  const token = randomUUID();
  const lease = await Model.findOneAndUpdate(
    {
      _id: userId,
      upmindClientId: null,
      $or: [
        { upmindProvisionLockExpiresAt: null },
        { upmindProvisionLockExpiresAt: { $lte: now } },
      ],
    },
    {
      $set: {
        upmindProvisionLock: token,
        upmindProvisionLockExpiresAt: new Date(now.getTime() + ttlMs),
      },
    },
    { new: true }
  ).select("+upmindProvisionLock");
  return lease?.upmindProvisionLock === token ? token : null;
}

// Only the holder may store a newly created remote customer ID. A late or
// expired lease cannot overwrite a link stored by another instance.
async function persistProvisionedClient(Model, userId, token, clientId, now = new Date()) {
  if (!token || !clientId) throw new TypeError("Missing Upmind provisioning result");
  const result = await Model.updateOne(
    {
      _id: userId,
      upmindClientId: null,
      upmindProvisionLock: token,
      upmindProvisionLockExpiresAt: { $gt: now },
    },
    {
      $set: { upmindClientId: clientId, upmindRetryNeeded: false },
      $unset: { encryptedPassword: 1 },
    }
  );
  return result.matchedCount === 1;
}

async function releaseProvisionLease(Model, userId, token) {
  if (!token) return;
  await Model.updateOne(
    { _id: userId, upmindProvisionLock: token },
    { $unset: { upmindProvisionLock: 1, upmindProvisionLockExpiresAt: 1 } }
  );
}

module.exports = {
  DEFAULT_LEASE_MS, acquireProvisionLease, persistProvisionedClient, releaseProvisionLease,
};
