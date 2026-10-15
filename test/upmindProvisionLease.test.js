"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Users = require("../models/User");
const {
  acquireProvisionLease, persistProvisionedClient, releaseProvisionLease, DEFAULT_LEASE_MS,
} = require("../utils/upmindProvisionLease");

test("Upmind lease is per-user, expires automatically and uses atomic compare-and-set", async t => {
  const userId = "507f1f77bcf86cd799439011";
  const now = new Date("2026-10-15T12:00:00Z");
  const acquired = [];
  t.mock.method(Users, "findOneAndUpdate", (filter, updates, options) => {
    acquired.push({ filter, updates, options });
    return { select: async fields => {
      assert.equal(fields, "+upmindProvisionLock");
      return { upmindProvisionLock: updates.$set.upmindProvisionLock };
    } };
  });
  const token = await acquireProvisionLease(Users, userId, now);
  assert.match(token, /^[0-9a-f-]{36}$/);
  assert.equal(acquired.length, 1);
  assert.equal(acquired[0].filter._id, userId);
  assert.equal(acquired[0].filter.upmindClientId, null);
  assert.ok(acquired[0].filter.$or.some(q => q.upmindProvisionLockExpiresAt?.$lte === now));
  assert.equal(acquired[0].updates.$set.upmindProvisionLockExpiresAt.getTime() - now.getTime(), DEFAULT_LEASE_MS);
  assert.equal(acquired[0].options.new, true);
  assert.ok(Users.schema.path("upmindProvisionLockExpiresAt"));
});

test("failed concurrent lease claim must not gain permission to create a client", async t => {
  t.mock.method(Users, "findOneAndUpdate", () => ({ select: async () => null }));
  assert.equal(await acquireProvisionLease(Users, "507f1f77bcf86cd799439011"), null);
});

test("only current nonexpired lease owner can write Upmind account linkage", async t => {
  const userId = "507f1f77bcf86cd799439011";
  const token = "the-current-lock-token";
  const writes = [];
  t.mock.method(Users, "updateOne", async (filter, updates) => {
    writes.push({ filter, updates });
    return { matchedCount: filter.upmindProvisionLock === token ? 1 : 0 };
  });
  const ok = await persistProvisionedClient(Users, userId, token, "remote-owner-123");
  assert.equal(ok, true);
  const lost = await persistProvisionedClient(Users, userId, "stale-lock-token", "remote-other");
  assert.equal(lost, false);
  assert.equal(writes[0].filter._id, userId);
  assert.equal(writes[0].filter.upmindClientId, null);
  assert.ok(writes[0].filter.upmindProvisionLockExpiresAt.$gt instanceof Date);
  assert.equal(writes[0].updates.$set.upmindClientId, "remote-owner-123");
  assert.equal(writes[0].updates.$unset.encryptedPassword, 1);

  await releaseProvisionLease(Users, userId, token);
  assert.deepEqual(writes[2].filter, { _id: userId, upmindProvisionLock: token });
  assert.equal(writes[2].updates.$unset.upmindProvisionLock, 1);
  assert.equal(writes[2].updates.$unset.upmindProvisionLockExpiresAt, 1);
});

test("invalid lease arguments are rejected before touching the account", async () => {
  const missingModel = { findOneAndUpdate() { throw new Error("Unexpected database call"); } };
  await assert.rejects(acquireProvisionLease(missingModel, null), TypeError);
  await assert.rejects(acquireProvisionLease(missingModel, "user", new Date("invalid")), TypeError);
  await assert.rejects(acquireProvisionLease(missingModel, "user", new Date(), 0), TypeError);
  await assert.rejects(persistProvisionedClient({}, "user", null, "remote"), TypeError);
  await releaseProvisionLease({}, "user", null);
});
