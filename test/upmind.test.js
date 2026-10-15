"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const { findExactClientMatch, collectCompleteClientSearch } = require("../services/upmindService");

test("Upmind customer linkage requires exact email AND confirmed brand ID", () => {
  const records = [
    { id: 12, email: "OWNER@EXAMPLE.COM", brand_id: "other-brand" },
    { id: 13, email: "owner@example.com", brand_id: "our-brand" },
    { id: 14, email: "wrong@example.com", brand_id: "our-brand" },
  ];
  assert.equal(findExactClientMatch(records, "Owner@Example.com", "our-brand").id, 13);
  assert.equal(findExactClientMatch(records, "Owner@Example.com", "unknown-brand"), null);
  assert.equal(findExactClientMatch(records, "wrong@example.com", "our-brand").id, 14);
  assert.equal(findExactClientMatch(records, "owner@example.com", null), null);
  assert.equal(findExactClientMatch([{ id: 15, email: "owner@example.com" }], "owner@example.com", "our-brand"), null);
});

test("ambiguous Upmind matches cannot auto-link a customer", () => {
  assert.equal(findExactClientMatch([
    { id: 10, email: "owner@example.com", brand_id: "our-brand" },
    { id: 11, email: "owner@example.com", brand_id: "our-brand" },
  ], "owner@example.com", "our-brand"), null);
  assert.equal(findExactClientMatch([], "owner@example.com", "our-brand"), null);
  assert.equal(findExactClientMatch(null, "owner@example.com", "our-brand"), null);
});

test("Upmind retry state has a persisted schema field", () => {
  const field = User.schema.path("upmindRetryNeeded");
  assert.ok(field);
  assert.equal(field.instance, "Boolean");
});

test("Upmind search fetches all pages before resolving a customer", async () => {
  const calls = [];
  const records = [
    { id: "other", email: "unrelated@example.com", brand_id: "our-brand" },
    { id: "first-page-other", email: "owner@example.com", brand_id: "wrong-brand" },
    { id: "correct", email: "owner@example.com", brand_id: "our-brand" },
  ];
  const candidates = await collectCompleteClientSearch(({ limit, offset }) => {
    calls.push({ limit, offset });
    return { status: "ok", data: records.slice(offset, offset + limit), total: records.length };
  }, { limit: 2, maxResults: 10 });
  assert.deepEqual(calls, [{ limit: 2, offset: 0 }, { limit: 2, offset: 2 }]);
  assert.equal(findExactClientMatch(candidates, "owner@example.com", "our-brand").id, "correct");
});

test("an empty complete Upmind search is distinguishable from an invalid response", async () => {
  assert.deepEqual(await collectCompleteClientSearch(async () =>
    ({ status: "ok", data: [], total: 0 })
  ), []);
  await assert.rejects(collectCompleteClientSearch(async () => ({ status: "ok", data: [] })),
    /Incomplete Upmind client search/);
  await assert.rejects(collectCompleteClientSearch(async () => ({ status: "error", data: [], total: 0 })),
    /Incomplete Upmind client search/);
  await assert.rejects(collectCompleteClientSearch(async () => ({ status: "ok", data: null, total: 0 })),
    /Incomplete Upmind client search/);
});

test("truncated and unbounded Upmind searches block duplicate provisioning", async () => {
  await assert.rejects(collectCompleteClientSearch(async () =>
    ({ data: [], total: 2 })
  ), /incomplete or exceeds/);
  await assert.rejects(collectCompleteClientSearch(async () =>
    ({ data: [{ id: 1 }, { id: 2 }], total: 1 })
  ), /incomplete or exceeds/);
  await assert.rejects(collectCompleteClientSearch(async () =>
    ({ data: [], total: 101 })
  ), /incomplete or exceeds/);
  await assert.rejects(collectCompleteClientSearch(async ({ offset }) =>
    offset === 0
      ? { data: [{ id: 1 }], total: 2 }
      : { data: [{ id: 2 }], total: 3 },
    { limit: 1, maxResults: 10 }
  ), /changed during pagination/);
  await assert.rejects(collectCompleteClientSearch(async () =>
    ({ data: [], total: 0 }), { limit: 20, maxResults: 10 }
  ), RangeError);
});

test("invalid Upmind identifiers are never linked to the account", () => {
  const ownerEmail = "owner@example.com";
  const brand = "our-brand";
  for (const invalid of [null, undefined, "", 0, -1, {}, [], "bad/id", " ".repeat(3), "A".repeat(129)]) {
    assert.equal(findExactClientMatch([
      { id: invalid, email: ownerEmail, brand_id: brand },
    ], ownerEmail, brand), null);
  }
  assert.equal(findExactClientMatch([
    { id: "valid-uuid_123", email: ownerEmail, brand_id: brand },
  ], ownerEmail, brand).id, "valid-uuid_123");
});
