"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const axios = require("axios");
const Users = require("../models/User");
const { encrypt } = require("../utils/crypto");

function isolatedUpmindService(t, fakeHttp) {
  const previousKey = process.env.UPMIND_KEY;
  const previousBrand = process.env.UPMIND_BRAND_ID;
  process.env.UPMIND_KEY = "test-key-not-for-production";
  process.env.UPMIND_BRAND_ID = "brand-test";
  t.mock.method(axios, "create", () => fakeHttp);
  // In-memory CAS-shaped MongoDB stub: tracks one user's lease, attempted
  // remote writes and guarded owner-only Upmind linkage across retries.
  const db = { lock: null, attemptedAt: null, linkedId: null, review: false, deny: false, writes: [], searches: 0 };
  t.mock.method(Users, "findOneAndUpdate", (_filter, update) => {
    if (db.deny || db.lock || db.linkedId) return { select: async () => null };
    db.lock = update.$set.upmindProvisionLock;
    return { select: async () => ({ upmindProvisionLock: db.lock }) };
  });
  t.mock.method(Users, "updateOne", async (filter, update) => {
    db.writes.push({ filter, update });
    if (db.lock !== filter.upmindProvisionLock) return { matchedCount: 0 };
    if (Object.hasOwn(filter, "upmindProvisionAttemptedAt") &&
        db.attemptedAt !== null) return { matchedCount: 0 };
    if (update.$set?.upmindProvisionAttemptedAt) db.attemptedAt = update.$set.upmindProvisionAttemptedAt;
    if (update.$set?.upmindRetryNeeded) db.review = true;
    if (update.$set?.upmindClientId) db.linkedId = update.$set.upmindClientId;
    if (update.$unset?.upmindProvisionAttemptedAt) db.attemptedAt = null;
    if (update.$unset?.upmindProvisionLock) db.lock = null;
    return { matchedCount: 1 };
  });
  const modulePath = require.resolve("../services/upmindService");
  delete require.cache[modulePath];
  const service = require(modulePath);
  service.__mockDb = db;
  t.after(() => {
    delete require.cache[modulePath];
    if (previousKey === undefined) delete process.env.UPMIND_KEY;
    else process.env.UPMIND_KEY = previousKey;
    if (previousBrand === undefined) delete process.env.UPMIND_BRAND_ID;
    else process.env.UPMIND_BRAND_ID = previousBrand;
  });
  return service;
}

function pendingUser() {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    email: "owner@example.com",
    firstName: "Owner",
    lastName: "Test",
    phone: "+15145550184",
    upmindClientId: null,
    encryptedPassword: undefined,
    upmindRetryNeeded: false,
    saves: 0,
    async save() { this.saves++; },
  };
  return user;
}

test("Upmind malformed search never triggers duplicate remote provisioning", async t => {
  let writes = 0;
  const service = isolatedUpmindService(t, {
    get: async () => ({ data: { status: "ok", data: [] } }), // no authoritative total
    post: async () => { writes++; throw new Error("MUST NOT CREATE"); },
  });
  const user = pendingUser();
  const result = await service.ensureUpmindClient(user);
  assert.equal(result, user);
  assert.equal(user.upmindClientId, null);
  assert.equal(user.upmindRetryNeeded, true);
  assert.equal(user.saves, 0, "No stale full-document user saves on unlinked path");
  assert.equal(writes, 0);
});

test("Upmind complete paginated lookup reuses only the exact owner's brand record", async t => {
  const calls = [];
  let writes = 0;
  const service = isolatedUpmindService(t, {
    async get(_route, { params }) {
      calls.push(params);
      assert.equal(params.search, "owner@example.com");
      assert.equal(params.brand_id, "brand-test");
      if (params.offset === 0) {
        return { data: {
          status: "ok", total: 26,
          data: Array.from({ length: 25 }, (_, i) => ({
            id: String(i + 1), email: "other@example.com", brand_id: "brand-test",
          })),
        }};
      }
      assert.equal(params.offset, 25);
      return { data: { status: "ok", total: 26, data: [
        { id: "client-right", email: "OWNER@example.com", brand_id: "brand-test" },
      ] }};
    },
    async post() { writes++; throw new Error("MUST NOT CREATE"); },
  });
  const user = pendingUser();
  user.encryptedPassword = "legacy-ciphertext";
  await service.ensureUpmindClient(user);
  assert.equal(calls.length, 2);
  assert.equal(user.upmindClientId, "client-right");
  assert.equal(user.upmindRetryNeeded, false);
  assert.equal(user.encryptedPassword, undefined);
  assert.equal(user.saves, 0, "No stale full-document user saves on unlinked path");
  assert.equal(writes, 0);
});

test("Upmind ambiguous existing lookup cannot provision a different customer", async t => {
  let writes = 0;
  const service = isolatedUpmindService(t, {
    get: async () => ({ data: { status: "ok", total: 1, data: [
      { id: "different", email: "owner@example.com", brand_id: "another-brand" },
    ] } }),
    post: async () => { writes++; throw new Error("MUST NOT CREATE"); },
  });
  const user = pendingUser();
  await service.ensureUpmindClient(user);
  assert.equal(user.upmindClientId, null);
  assert.equal(user.upmindRetryNeeded, true);
  assert.equal(user.saves, 0, "No stale full-document user saves on unlinked path");
  assert.equal(writes, 0);
});

test("Upmind only provisions from a verified complete empty search with valid remote ID", async t => {
  const oldSecret = process.env.PASSWORD_ENCRYPT_SECRET;
  process.env.PASSWORD_ENCRYPT_SECRET = "a".repeat(64);
  t.after(() => {
    if (oldSecret === undefined) delete process.env.PASSWORD_ENCRYPT_SECRET;
    else process.env.PASSWORD_ENCRYPT_SECRET = oldSecret;
  });
  const writes = [];
  const service = isolatedUpmindService(t, {
    get: async (_route, { params }) => {
      assert.equal(params.offset, 0);
      return { data: { status: "ok", total: 0, data: [] } };
    },
    async post(_route, body) {
      writes.push(body);
      return { data: { id: "valid-provision-id" } };
    },
  });
  const user = pendingUser();
  user.encryptedPassword = encrypt("not-a-real-password");
  await service.ensureUpmindClient(user);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].brand_id, "brand-test");
  assert.equal(writes[0].email, "owner@example.com");
  assert.equal(writes[0].password, "not-a-real-password");
  assert.equal(user.upmindClientId, "valid-provision-id");
  assert.equal(user.encryptedPassword, undefined);
  assert.equal(user.upmindRetryNeeded, false);
  assert.equal(user.saves, 0, "Association uses a guarded MongoDB update");
  assert.equal(service.__mockDb.writes.length, 3, "Mark remote attempt, persist, then release");
  assert.equal(service.__mockDb.writes[0].update.$set.upmindRetryNeeded, true);
  assert.equal(service.__mockDb.writes[1].update.$set.upmindClientId, "valid-provision-id");
  assert.equal(service.__mockDb.writes[2].update.$unset.upmindProvisionLock, 1);
  assert.equal(service.__mockDb.attemptedAt, null);
});

test("a second worker without the MongoDB lease cannot POST a duplicate Upmind client", async t => {
  const oldSecret = process.env.PASSWORD_ENCRYPT_SECRET;
  process.env.PASSWORD_ENCRYPT_SECRET = "a".repeat(64);
  t.after(() => {
    if (oldSecret === undefined) delete process.env.PASSWORD_ENCRYPT_SECRET;
    else process.env.PASSWORD_ENCRYPT_SECRET = oldSecret;
  });
  let posts = 0;
  const service = isolatedUpmindService(t, {
    get: async () => ({ data: { status: "ok", total: 0, data: [] } }),
    async post() { posts++; throw new Error("must not create"); },
  });
  service.__mockDb.deny = true;
  const user = pendingUser();
  user.encryptedPassword = encrypt("not-a-real-password");
  const result = await service.ensureUpmindClient(user);
  assert.equal(result, user);
  assert.equal(result.upmindClientId, null);
  assert.equal(result.upmindRetryNeeded, true);
  assert.equal(posts, 0);
  assert.equal(user.saves, 0, "Losing worker must not overwrite winning association state");
});

test("ambiguous remote-create outcome blocks later empty-search retry", async t => {
  const oldSecret = process.env.PASSWORD_ENCRYPT_SECRET;
  process.env.PASSWORD_ENCRYPT_SECRET = "a".repeat(64);
  t.after(() => {
    if (oldSecret === undefined) delete process.env.PASSWORD_ENCRYPT_SECRET;
    else process.env.PASSWORD_ENCRYPT_SECRET = oldSecret;
  });
  let remotePosts = 0;
  const service = isolatedUpmindService(t, {
    get: async () => ({ data: { status: "ok", total: 0, data: [] } }),
    async post() {
      remotePosts++;
      throw new Error("Simulated provider timeout after create request");
    },
  });
  const first = pendingUser();
  first.encryptedPassword = encrypt("fake-only-test-credential");
  await service.ensureUpmindClient(first);
  assert.equal(remotePosts, 1);
  assert.ok(service.__mockDb.attemptedAt, "Ambiguous remote request remains durably marked");
  assert.equal(service.__mockDb.lock, null, "Lease released after uncertain POST");

  const retry = pendingUser();
  retry.encryptedPassword = first.encryptedPassword;
  await service.ensureUpmindClient(retry);
  assert.equal(remotePosts, 1, "A fresh empty search cannot authorize a second POST");
  assert.equal(retry.upmindRetryNeeded, true);
  assert.equal(service.__mockDb.linkedId, null);
  assert.equal(retry.saves, 0);
});

test("stale user after successful provisioning cannot start another lookup or POST", async t => {
  const oldSecret = process.env.PASSWORD_ENCRYPT_SECRET;
  process.env.PASSWORD_ENCRYPT_SECRET = "a".repeat(64);
  t.after(() => {
    if (oldSecret === undefined) delete process.env.PASSWORD_ENCRYPT_SECRET;
    else process.env.PASSWORD_ENCRYPT_SECRET = oldSecret;
  });
  let reads = 0, writes = 0;
  const service = isolatedUpmindService(t, {
    async get() {
      reads++;
      return { data: { status: "ok", total: 0, data: [] } };
    },
    async post() {
      writes++;
      return { data: { id: "remote-linked" } };
    },
  });
  const first = pendingUser();
  first.encryptedPassword = encrypt("fake-only-test-credential");
  await service.ensureUpmindClient(first);
  const stale = pendingUser();
  stale.encryptedPassword = encrypt("fake-only-test-credential");
  await service.ensureUpmindClient(stale);
  assert.equal(reads, 1, "Lease acquisition precedes every provider search");
  assert.equal(writes, 1);
  assert.equal(stale.saves, 0, "The loser must not write a stale account");
  assert.equal(service.__mockDb.linkedId, "remote-linked");
});

test("completed provider search can reconcile an uncertain previous remote POST", async t => {
  const service = isolatedUpmindService(t, {
    get: async () => ({ data: { status: "ok", total: 1, data: [
      { id: "existing-remote-id", email: "owner@example.com", brand_id: "brand-test" },
    ] } }),
    post: async () => { throw new Error("Must never call create"); },
  });
  service.__mockDb.attemptedAt = new Date();
  const user = pendingUser();
  await service.ensureUpmindClient(user);
  assert.equal(service.__mockDb.linkedId, "existing-remote-id");
  assert.equal(service.__mockDb.attemptedAt, null);
  assert.equal(user.upmindClientId, "existing-remote-id");
  assert.equal(user.saves, 0);
});
