"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../models/User");
const { findExactClientMatch } = require("../services/upmindService");

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
