"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { randomToken, hashToken, verifyTokenHash } = require("../utils/tokenHelpers");
const { getCookie, getCredential } = require("../utils/requestCredentials");

test("refresh hashes are deterministic SHA-256 and validate in constant-time path", async () => {
  const token = randomToken(48);
  assert.match(token, /^[a-f0-9]{96}$/);
  const digest = hashToken(token);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(await verifyTokenHash(token, digest), true);
  assert.equal(await verifyTokenHash(randomToken(), digest), false);
  assert.equal(await verifyTokenHash(token, "not-a-hash"), false);
});

test("previous bcrypt session digests remain valid", async () => {
  const token = randomToken();
  const digest = await bcrypt.hash(token, 4);
  assert.equal(await verifyTokenHash(token, digest), true);
  assert.equal(await verifyTokenHash(randomToken(), digest), false);
});

test("random token sizes are bounded", () => {
  assert.throws(() => randomToken(8), RangeError);
  assert.throws(() => randomToken(256), RangeError);
  assert.throws(() => hashToken(null), TypeError);
});

test("request credentials support browser cookies and mobile JSON bodies", () => {
  const req = { headers: { cookie: "other=x; sid=abc%2D123; refresh_token=opaque%3D" }, body: { sid: "ignored" } };
  assert.equal(getCookie(req, "sid"), "abc-123");
  assert.equal(getCredential(req, "refresh_token"), "opaque=");
  assert.equal(getCredential(req, "sid"), "abc-123");
  assert.equal(getCredential({ headers: {}, body: { sid: "mobile" } }, "sid"), "mobile");
  assert.equal(getCredential({ headers: {}, body: { sid: 23 } }, "sid"), undefined);
});

test("malformed cookies do not throw or trust broken values", () => {
  const req = { headers: { cookie: "sid=%invalid; x=ok" } };
  assert.equal(getCookie(req, "sid"), undefined);
  assert.equal(getCookie(req, "x"), "ok");
});
