"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assessSessionIndexes } = require("../scripts/audit-session-ttl");

test("healthy session indexes follow actual expiresAt and no obsolete 7-day TTL", () => {
  const x = assessSessionIndexes([
    { name: "_id_", key: { _id: 1 } },
    { name: "expiresAt_1", key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ]);
  assert.equal(x.healthy, true);
  assert.deepEqual(x.obsoleteCreatedAtTtlIndexes, []);
});

test("read-only audit identifies 7-day createdAt TTL without changing indexes", () => {
  const indexes = [
    { name: "createdAt_1", key: { createdAt: 1 }, expireAfterSeconds: 604800 },
    { name: "expiresAt_1", key: { expiresAt: 1 }, expireAfterSeconds: 0 },
  ];
  const snapshot = structuredClone(indexes);
  const x = assessSessionIndexes(indexes);
  assert.equal(x.healthy, false);
  assert.deepEqual(x.obsoleteCreatedAtTtlIndexes, ["createdAt_1"]);
  assert.deepEqual(indexes, snapshot);
});

test("audit fails closed when expiresAt TTL is missing or misconfigured", () => {
  assert.equal(assessSessionIndexes([]).healthy, false);
  assert.equal(assessSessionIndexes([
    { name: "expiresAt_1", key: { expiresAt: 1 }, expireAfterSeconds: 604800 },
  ]).healthy, false);
  assert.throws(() => assessSessionIndexes(null), TypeError);
});
