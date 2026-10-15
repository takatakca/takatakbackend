"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  inspectTrackedFile, gitBlobSha, LEGACY_EXPOSED_GIT_BLOB_SHA,
} = require("../scripts/check-tracked-secrets");

test("tracks known historic key only at its original immutable blob", () => {
  assert.equal(LEGACY_EXPOSED_GIT_BLOB_SHA.length, 40);
  assert.match(gitBlobSha(Buffer.from("example")), /^[a-f0-9]{40}$/);
  assert.match(inspectTrackedFile("keys/private.pem", "not the original key")[0],
    /no new key may be committed/);
  const pem = ["-----BEGIN", "RSA PRIVATE KEY-----", "invalid-test", "-----END RSA PRIVATE KEY-----"].join("\n");
  assert.ok(inspectTrackedFile("keys/other.pem", pem).length > 0);
  assert.ok(inspectTrackedFile("keys/private.pem", pem).length > 0);
});

test("blocks tracked .env files and binary key containers, allows templates", () => {
  assert.deepEqual(inspectTrackedFile(".env", "FOO=bar"),
    ["Tracked environment configuration is forbidden"]);
  assert.deepEqual(inspectTrackedFile("deploy/.env.production", "FOO=bar"),
    ["Tracked environment configuration is forbidden"]);
  assert.deepEqual(inspectTrackedFile("deploy/.env.example", "FOO=placeholder"), []);
  assert.deepEqual(inspectTrackedFile("backup.p12", Buffer.from("test")),
    ["Tracked binary private-key container is forbidden"]);
  assert.deepEqual(inspectTrackedFile("keys/public.pem", "public material"), []);
});

test("blocks recognizable live token forms without displaying their values", () => {
  const sample = "ghp_" + "x".repeat(40);
  const findings = inspectTrackedFile("config/settings.js", sample);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].includes(sample), false);
  assert.deepEqual(inspectTrackedFile("code/index.js", "const auth = process.env.TOKEN;"), []);
});
