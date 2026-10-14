"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const jwt = require("jsonwebtoken");
const Session = require("../models/Session");
const { createSessionAndSetCookies } = require("../controller/authSession");

test("issued JWT key identifier matches JWKS across configured key rotation", async t => {
  const pair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "takatak-kid-"));
  const privatePath = path.join(dir, "private.pem");
  const publicPath = path.join(dir, "public.pem");
  fs.writeFileSync(privatePath, pair.privateKey, { mode: 0o600 });
  fs.writeFileSync(publicPath, pair.publicKey, { mode: 0o600 });
  const before = Object.fromEntries(
    ["PRIVATE_KEY_PATH", "PUBLIC_KEY_PATH", "JWT_KEY_ID"].map(key => [key, process.env[key]])
  );
  process.env.PRIVATE_KEY_PATH = privatePath;
  process.env.PUBLIC_KEY_PATH = publicPath;
  process.env.JWT_KEY_ID = "takatak-rotation-2026";
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    fs.rmSync(dir, { recursive: true, force: true });
  });

  let persistedSession;
  t.mock.method(Session, "create", async session => {
    persistedSession = session;
    return session;
  });

  const issued = await createSessionAndSetCookies(
    { _id: "507f1f77bcf86cd799439011", role: "user", email: "member@example.com" },
    { headers: { "user-agent": "test-agent" }, ip: "127.0.0.1" },
    { cookie() {}, set() {} }
  );
  const decoded = jwt.decode(issued.accessToken, { complete: true });
  assert.equal(decoded.header.kid, "takatak-rotation-2026");
  assert.equal(decoded.header.alg, "RS256");
  assert.equal(jwt.verify(issued.accessToken, pair.publicKey, { algorithms: ["RS256"], issuer: "https://takatak.ca" }).sub,
    "507f1f77bcf86cd799439011");
  assert.equal(persistedSession._id, issued.sid);

  // Import only after PUBLIC_KEY_PATH has been configured in this test worker.
  const { getJwks } = require("../controller/Auth");
  let jwks;
  await getJwks({}, { json(result) { jwks = result; }, set() {}, status(code) { throw new Error("JWKS returned " + code); } });
  assert.equal(jwks.keys.length, 1);
  assert.equal(jwks.keys[0].kid, decoded.header.kid);
  assert.equal(jwks.keys[0].alg, "RS256");
  assert.equal(jwks.keys[0].use, "sig");
  assert.equal(jwks.keys[0].d, undefined, "JWKS must not expose private RSA components");

  // A newly provisioned public key must be published by the next request,
  // without keeping the old public key cached at module import.
  const nextKeyPair = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const oldModulus = jwks.keys[0].n;
  fs.writeFileSync(publicPath, nextKeyPair.publicKey);
  await getJwks({}, { json(result) { jwks = result; }, set() {}, status(code) { throw new Error("JWKS returned " + code); } });
  assert.notEqual(jwks.keys[0].n, oldModulus, "JWKS must reflect replacement public key");
});
