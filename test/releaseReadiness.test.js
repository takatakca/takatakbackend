"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { inspectReleaseEnvironment } = require("../scripts/check-release-readiness");

test("production release preflight accepts matching external RSA keys and trusted origins", t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "takatak-release-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const privatePath = path.join(dir, "private.pem");
  const publicPath = path.join(dir, "public.pem");
  fs.writeFileSync(privatePath, first.privateKey, { mode: 0o600 });
  fs.writeFileSync(publicPath, first.publicKey, { mode: 0o600 });
  const vars = {
    NODE_ENV: "production",
    MONGO_URI: "mongodb://localhost:27017/takatak",
    PRIVATE_KEY_PATH: privatePath,
    PUBLIC_KEY_PATH: publicPath,
    JWT_KEY_ID: "new-takatak-key-2026",
    ISSUER: "https://takatak.ca",
    CORS_ORIGINS: "https://takatak.ca,https://www.takatak.ca",
  };
  assert.deepEqual(inspectReleaseEnvironment(vars), { ok: true, errors: [] });
  assert.ok(inspectReleaseEnvironment({ ...vars, JWT_KEY_ID: "takatak-key" })
    .errors.some(message => message.includes("legacy signing key")));

  const second = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  fs.writeFileSync(publicPath, second.publicKey);
  assert.ok(inspectReleaseEnvironment(vars).errors.some(message => message.includes("do not match")));
});

test("release preflight fails closed on missing secrets and unsafe origins", () => {
  const result = inspectReleaseEnvironment({
    NODE_ENV: "production",
    CORS_ORIGINS: "https://takatak.ca,https://untrusted.example/path",
    JWT_KEY_ID: "new-key",
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(message => message.includes("PRIVATE_KEY_PATH")));
  assert.ok(result.errors.some(message => message.includes("CORS_ORIGINS")));
  assert.ok(!JSON.stringify(result).includes("secret-value-should-not-appear"));
});
