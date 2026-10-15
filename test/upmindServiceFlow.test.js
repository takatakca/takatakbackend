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
  const modulePath = require.resolve("../services/upmindService");
  delete require.cache[modulePath];
  const service = require(modulePath);
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
  assert.equal(user.saves, 1);
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
  assert.equal(user.saves, 1);
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
  assert.equal(user.saves, 1);
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
  const leaseWrites = [];
  t.mock.method(Users, "findOneAndUpdate", (filter, update) => {
    assert.equal(filter._id, "507f1f77bcf86cd799439011");
    assert.equal(filter.upmindClientId, null);
    const token = update.$set.upmindProvisionLock;
    return { select: async () => ({ upmindProvisionLock: token }) };
  });
  t.mock.method(Users, "updateOne", async (filter, update) => {
    leaseWrites.push({ filter, update });
    return { matchedCount: 1, modifiedCount: 1 };
  });
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
  assert.equal(leaseWrites.length, 2, "Persist then release the acquired lease");
  assert.equal(leaseWrites[0].update.$set.upmindClientId, "valid-provision-id");
  assert.equal(leaseWrites[1].update.$unset.upmindProvisionLock, 1);
});

test("a second worker without the MongoDB lease cannot POST a duplicate Upmind client", async t => {
  const oldSecret = process.env.PASSWORD_ENCRYPT_SECRET;
  process.env.PASSWORD_ENCRYPT_SECRET = "a".repeat(64);
  t.after(() => {
    if (oldSecret === undefined) delete process.env.PASSWORD_ENCRYPT_SECRET;
    else process.env.PASSWORD_ENCRYPT_SECRET = oldSecret;
  });
  let posts = 0;
  t.mock.method(Users, "findOneAndUpdate", () => ({
    select: async () => null, // Another worker owns the lease.
  }));
  const service = isolatedUpmindService(t, {
    get: async () => ({ data: { status: "ok", total: 0, data: [] } }),
    async post() { posts++; throw new Error("must not create"); },
  });
  const user = pendingUser();
  user.encryptedPassword = encrypt("not-a-real-password");
  const result = await service.ensureUpmindClient(user);
  assert.equal(result, user);
  assert.equal(result.upmindClientId, null);
  assert.equal(result.upmindRetryNeeded, true);
  assert.equal(posts, 0);
  assert.equal(user.saves, 0, "Losing worker must not overwrite winning association state");
});
