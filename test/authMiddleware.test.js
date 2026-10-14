"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const Session = require("../models/Session");
const User = require("../models/User");
const authMiddleware = require("../middleware/authMiddleware");

test("JWT bearer authorization requires a live matching DB session and DB-sourced role", async t => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "takatak-auth-test-"));
  const keyFile = path.join(dir, "public.pem");
  fs.writeFileSync(keyFile, publicKey);
  const previousKeyPath = process.env.PUBLIC_KEY_PATH;
  process.env.PUBLIC_KEY_PATH = keyFile;
  t.after(() => {
    if (previousKeyPath === undefined) delete process.env.PUBLIC_KEY_PATH;
    else process.env.PUBLIC_KEY_PATH = previousKeyPath;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const userId = "507f1f77bcf86cd799439011";
  const sid = "11111111-1111-4111-8111-111111111111";
  let active = true;
  let verified = true;
  let sessionQuery;
  let requestedUserId;

  t.mock.method(Session, "findOne", query => {
    sessionQuery = query;
    return { select: async () => active ? { _id: sid } : null };
  });
  t.mock.method(User, "findById", id => {
    requestedUserId = id;
    return {
      select: async () => ({ _id: userId, role: "user", email: "customer@example.com", isVerified: verified }),
    };
  });

  const token = jwt.sign(
    { sub: userId, sid, role: "admin", email: "forged@example.com" },
    privateKey,
    { algorithm: "RS256", expiresIn: "10m", issuer: "https://takatak.ca" }
  );
  const run = async authorization => {
    const req = { headers: { authorization } };
    const res = {
      statusCode: 200,
      status(n) { this.statusCode = n; return this; },
      json(body) { this.body = body; return this; },
    };
    let called = false;
    await authMiddleware(req, res, () => { called = true; });
    return { req, res, called };
  };

  const ok = await run("Bearer " + token);
  assert.equal(ok.called, true);
  assert.equal(ok.req.user.id, userId);
  assert.equal(ok.req.user.role, "user", "forged JWT role must not be trusted");
  assert.equal(ok.req.user.email, "customer@example.com");
  assert.equal(sessionQuery._id, sid);
  assert.equal(sessionQuery.userId, userId);
  assert.equal(sessionQuery.revoked, false);
  assert.ok(sessionQuery.expiresAt.$gt instanceof Date);
  assert.equal(requestedUserId, userId);

  active = false;
  const revoked = await run("Bearer " + token);
  assert.equal(revoked.called, false);
  assert.equal(revoked.res.statusCode, 401);
  active = true;
  verified = false;
  const unverified = await run("Bearer " + token);
  assert.equal(unverified.called, false);
  assert.equal(unverified.res.statusCode, 401);

  const missing = await run(undefined);
  assert.equal(missing.called, false);
  assert.equal(missing.res.statusCode, 401);
});
