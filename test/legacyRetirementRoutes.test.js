"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const Auth = require("../controller/Auth");
const Session = require("../models/Session");
const User = require("../models/User");

const entryRoutes = [
  ["/auth/register", "register"],
  ["/auth/login", "login"],
  ["/auth/verify-otp", "verifyOtp"],
  ["/auth/resend-code", "requestNewCode"],
];

function loadRouter(flag) {
  const previous = process.env.TAKATAK_LEGACY_AUTH_RETIRED;
  if (flag === undefined) delete process.env.TAKATAK_LEGACY_AUTH_RETIRED;
  else process.env.TAKATAK_LEGACY_AUTH_RETIRED = flag;
  const filename = require.resolve("../routes/handler");
  delete require.cache[filename];
  try { return require(filename); }
  finally {
    delete require.cache[filename];
    if (previous === undefined) delete process.env.TAKATAK_LEGACY_AUTH_RETIRED;
    else process.env.TAKATAK_LEGACY_AUTH_RETIRED = previous;
  }
}

async function serve(t, router) {
  const app = express();
  app.use(express.json());
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  t.after(() => new Promise(resolve => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("source merge preserves legacy entry handlers unless retirement is explicitly enabled", async t => {
  for (const flag of [undefined, "", "false", "TRUE", "1"]) {
    await t.test(`startup flag ${String(flag)}`, async child => {
      const calls = [];
      for (const [, name] of entryRoutes) {
        child.mock.method(Auth, name, (_req, res) => {
          calls.push(name);
          res.status(200).json({ handler: name });
        });
      }
      const base = await serve(child, loadRouter(flag));
      for (const [route, name] of entryRoutes) {
        const response = await fetch(base + route, { method: "POST" });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { handler: name });
      }
      assert.deepEqual(calls, entryRoutes.map(([, name]) => name));
    });
  }
});

test("explicit retirement blocks all entry handlers without provider calls or cached responses", async t => {
  let calls = 0;
  for (const [, name] of entryRoutes) {
    t.mock.method(Auth, name, (_req, res) => { calls++; res.sendStatus(500); });
  }
  const base = await serve(t, loadRouter("true"));
  for (const [route] of entryRoutes) {
    const response = await fetch(base + route, { method: "POST" });
    assert.equal(response.status, 410);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.json();
    assert.equal(body.error, "retired");
    assert.match(body.message, /https:\/\/takatak\.ca\/login/);
  }
  assert.equal(calls, 0);
  for (const [route, method] of [["/auth/refresh", "POST"], ["/auth/logout", "POST"], ["/user/dashboard", "GET"], ["/user/upmindClientId", "GET"]]) {
    const response = await fetch(base + route, { method });
    assert.equal(response.status, 401, `${route} keeps its credential boundary`);
    await response.arrayBuffer();
  }
});

test("Upmind retirement remains behind real JWT/session checks and JWKS stays available", async t => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "takatak-retirement-test-"));
  const publicPath = path.join(dir, "public.pem");
  fs.writeFileSync(publicPath, publicKey.export({ type: "spki", format: "pem" }));
  const previous = process.env.PUBLIC_KEY_PATH;
  process.env.PUBLIC_KEY_PATH = publicPath;
  t.after(() => {
    if (previous === undefined) delete process.env.PUBLIC_KEY_PATH;
    else process.env.PUBLIC_KEY_PATH = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const userId = "507f1f77bcf86cd799439011";
  const sid = "11111111-1111-4111-8111-111111111111";
  let active = true;
  let calls = 0;
  t.mock.method(Session, "findOne", query => {
    assert.equal(query.userId, userId);
    assert.equal(query._id, sid);
    assert.equal(query.revoked, false);
    return { select: async () => active ? { _id: sid } : null };
  });
  t.mock.method(User, "findById", id => {
    assert.equal(id, userId);
    return { select: async () => ({ _id: userId, role: "user", isVerified: true }) };
  });
  t.mock.method(Auth, "createUpmindSession", (_req, res) => { calls++; res.json({ legacy: true }); });
  const headers = { authorization: "Bearer " + jwt.sign({ sub: userId, sid }, privateKey, {
    algorithm: "RS256", expiresIn: "5m", issuer: process.env.ISSUER || "https://takatak.ca",
  }) };
  const enabled = await serve(t, loadRouter("true"));
  const retired = await fetch(enabled + "/user/upmindClientId", { headers });
  assert.equal(retired.status, 410);
  await retired.arrayBuffer();
  assert.equal(calls, 0);
  const jwks = await fetch(enabled + "/auth/well-known/jwks.json");
  assert.equal(jwks.status, 200);
  assert.equal((await jwks.json()).keys.length, 1);
  active = false;
  const revoked = await fetch(enabled + "/user/upmindClientId", { headers });
  assert.equal(revoked.status, 401);
  await revoked.arrayBuffer();
  active = true;
  const disabled = await serve(t, loadRouter(undefined));
  const original = await fetch(disabled + "/user/upmindClientId", { headers });
  assert.equal(original.status, 200);
  assert.deepEqual(await original.json(), { legacy: true });
  assert.equal(calls, 1);
});
