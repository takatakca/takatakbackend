"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const Users = require("../models/User");
const { createUpmindSession } = require("../controller/Auth");

function response() {
  return {
    statusCode: 200,
    headers: {},
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("Upmind client token is private, short-lived and bound to authenticated owner", async t => {
  const oldSecret = process.env.UPMIND_SECRET;
  const secret = "test-only-secret-with-at-least-32-characters";
  process.env.UPMIND_SECRET = secret;
  t.after(() => {
    if (oldSecret === undefined) delete process.env.UPMIND_SECRET;
    else process.env.UPMIND_SECRET = oldSecret;
  });
  const userId = "507f1f77bcf86cd799439011";
  let selected;
  t.mock.method(Users, "findById", id => {
    assert.equal(id, userId);
    return { select(fields) {
      selected = fields;
      return Promise.resolve({ _id: userId, upmindClientId: "client-test-owner" });
    } };
  });
  const res = response();
  await createUpmindSession({ user: { id: userId } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
  assert.equal(selected, "+upmindClientId");
  const claims = jwt.verify(res.body.upmindToken, secret);
  assert.equal(claims.sub, userId);
  assert.equal(claims.upmindId, "client-test-owner");
  assert.equal(claims.exp - claims.iat, 300);
});

test("Upmind client token cannot be issued without authenticated user or configured secret", async t => {
  const oldSecret = process.env.UPMIND_SECRET;
  t.after(() => {
    if (oldSecret === undefined) delete process.env.UPMIND_SECRET;
    else process.env.UPMIND_SECRET = oldSecret;
  });
  let lookups = 0;
  t.mock.method(Users, "findById", () => { lookups++; throw new Error("Should not query DB"); });

  process.env.UPMIND_SECRET = "test-only-secret-with-at-least-32-characters";
  const anonymous = response();
  await createUpmindSession({}, anonymous);
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.headers["Cache-Control"], "private, no-store");

  process.env.UPMIND_SECRET = "short";
  const disabled = response();
  await createUpmindSession({ user: { id: "fake" } }, disabled);
  assert.equal(disabled.statusCode, 503);
  assert.equal(lookups, 0);
});

test("unlinked user cannot receive an Upmind client token", async t => {
  const oldSecret = process.env.UPMIND_SECRET;
  process.env.UPMIND_SECRET = "test-only-secret-with-at-least-32-characters";
  t.after(() => {
    if (oldSecret === undefined) delete process.env.UPMIND_SECRET;
    else process.env.UPMIND_SECRET = oldSecret;
  });
  t.mock.method(Users, "findById", () => ({ select: async () => ({ upmindClientId: null }) }));
  const res = response();
  await createUpmindSession({ user: { id: "507f1f77bcf86cd799439011" } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.headers["Cache-Control"], "private, no-store");
  assert.equal(res.body.upmindToken, undefined);
});
