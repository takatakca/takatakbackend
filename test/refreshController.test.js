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
const { refreshTokenHandler } = require("../controller/refreshController");
const { randomToken, hashToken } = require("../utils/tokenHelpers");

function response() {
  return {
    statusCode: 200,
    cookies: [],
    clearedCookies: [],
    headers: {},
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
    clearCookie(name) { this.clearedCookies.push(name); return this; },
    set(name, value) { this.headers[name] = value; return this; },
  };
}

test("refresh rotates only after valid secret, user check, and successful RS256 signing", async t => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "takatak-refresh-"));
  const keyFile = path.join(dir, "private.pem");
  fs.writeFileSync(keyFile, privateKey, { mode: 0o600 });
  const oldPath = process.env.PRIVATE_KEY_PATH;
  process.env.PRIVATE_KEY_PATH = keyFile;
  t.after(() => {
    if (oldPath === undefined) delete process.env.PRIVATE_KEY_PATH;
    else process.env.PRIVATE_KEY_PATH = oldPath;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const sid = "11111111-1111-4111-8111-111111111111";
  const userId = "507f1f77bcf86cd799439011";
  const firstToken = randomToken(48);
  const session = {
    _id: sid,
    userId,
    revoked: false,
    expiresAt: new Date(Date.now() + 3_600_000),
    refreshHash: hashToken(firstToken),
  };
  let userLookups = 0;
  let writes = 0;
  let permitRotation = true;
  t.mock.method(Session, "findById", async requested => {
    assert.equal(requested, sid);
    return session;
  });
  t.mock.method(User, "findById", requested => {
    assert.equal(String(requested), userId);
    userLookups++;
    return { select: async () => ({ isVerified: true }) };
  });
  t.mock.method(Session, "findOneAndUpdate", async (filter, changes) => {
    writes++;
    assert.equal(filter._id, sid);
    assert.equal(filter.refreshHash, session.refreshHash);
    if (!permitRotation) return null;
    session.refreshHash = changes.$set.refreshHash;
    session.expiresAt = changes.$set.expiresAt;
    return { ...session };
  });

  const call = async token => {
    const res = response();
    await refreshTokenHandler({ body: { sid, refresh_token: token }, headers: {} }, res);
    return res;
  };

  const invalid = await call(randomToken(48));
  assert.equal(invalid.statusCode, 401);
  assert.equal(userLookups, 0, "Unknown refresh secret must not query the user's account");
  assert.equal(writes, 0, "Invalid credentials cannot rotate a session");

  const success = await call(firstToken);
  assert.equal(success.statusCode, 200);
  assert.equal(writes, 1);
  assert.equal(userLookups, 1);
  assert.equal(success.headers["Cache-Control"], "no-store");
  const decoded = jwt.verify(success.body.accessToken, publicKey, {
    issuer: "https://takatak.ca",
    algorithms: ["RS256"],
  });
  assert.equal(decoded.sid, sid);
  assert.equal(decoded.sub, userId);
  const nextToken = success.cookies.find(cookie => cookie.name === "refresh_token");
  assert.ok(nextToken);
  assert.equal(nextToken.options.httpOnly, true);
  assert.notEqual(nextToken.value, firstToken);
  assert.equal(hashToken(nextToken.value), session.refreshHash);

  const replay = await call(firstToken);
  assert.equal(replay.statusCode, 401);
  assert.equal(writes, 1, "Previously rotated token is rejected");
  assert.equal(userLookups, 1);

  // A stale concurrent request may pass initial credential check but must
  // lose compare-and-swap without setting an unusable cookie.
  permitRotation = false;
  const conflict = await call(nextToken.value);
  assert.equal(conflict.statusCode, 401);
  assert.equal(conflict.cookies.length, 0);
  assert.equal(writes, 2);

  // An invalid signing key is detected BEFORE the refresh credential is rotated.
  permitRotation = true;
  process.env.PRIVATE_KEY_PATH = path.join(dir, "missing.pem");
  const signingFailure = await call(nextToken.value);
  assert.equal(signingFailure.statusCode, 500);
  assert.equal(signingFailure.cookies.length, 0);
  assert.equal(writes, 2);
});
