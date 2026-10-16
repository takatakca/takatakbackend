"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const Users = require("../models/User");
const sgMail = require("@sendgrid/mail");
const { login, requestNewCode, register } = require("../controller/Auth");
const { COOLDOWN_MS, EMAIL_OTP_LIFETIME_MS, reserveLegacyOtpRequest } = require("../utils/legacyOtpIssuance");

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
}
function mockMail(t, send) {
  const beforeKey = process.env.SENDGRID_API_KEY;
  const beforeFrom = process.env.SENDER_EMAIL;
  process.env.SENDGRID_API_KEY = "test-only-api-key";
  process.env.SENDER_EMAIL = "testing@example.test";
  t.mock.method(sgMail, "setApiKey", () => {});
  t.mock.method(sgMail, "send", send);
  t.after(() => {
    if (beforeKey === undefined) delete process.env.SENDGRID_API_KEY;
    else process.env.SENDGRID_API_KEY = beforeKey;
    if (beforeFrom === undefined) delete process.env.SENDER_EMAIL;
    else process.env.SENDER_EMAIL = beforeFrom;
  });
}
const id = "507f1f77bcf86cd799439011";

test("one MongoDB atomic request reserves email OTP hash, expiry and cooldown together", async () => {
  const now = new Date("2026-10-16T08:00:00Z");
  let call;
  const db = {
    async updateOne(filter, changes) {
      call = { filter, changes };
      return { matchedCount: 1 };
    },
  };
  assert.equal(await reserveLegacyOtpRequest(db, id, { now, emailHash: "stored-bcrypt-hash" }), true);
  assert.equal(call.filter._id, id);
  assert.ok(call.filter.$or.some(v => v.lastOtpRequestedAt === null));
  assert.deepEqual(call.filter.$or[1], { lastOtpRequestedAt: { $lte: new Date(now.getTime() - COOLDOWN_MS) } });
  assert.equal(call.changes.$set.lastOtpRequestedAt, now);
  assert.equal(call.changes.$set.userotp, "stored-bcrypt-hash");
  assert.equal(call.changes.$set.otpAttempts, 0);
  assert.equal(call.changes.$set.regTokenExpires.getTime() - now.getTime(), EMAIL_OTP_LIFETIME_MS);
});

test("phone OTP uses atomic cooldown without touching stored email hash", async () => {
  let updates;
  const db = {
    async updateOne(_filter, changes) {
      updates = changes.$set;
      return { matchedCount: 1 };
    },
  };
  assert.equal(await reserveLegacyOtpRequest(db, id), true);
  assert.deepEqual(Object.keys(updates), ["lastOtpRequestedAt"]);
});

test("simultaneous email login and resend only send one committed code", async t => {
  const user = { _id: id, email: "member@example.test", phone: "+15145550184" };
  let saved = null;
  let committed = null;
  const issued = [];
  mockMail(t, async msg => {
    assert.ok(saved, "Code must be committed before SendGrid invocation");
    issued.push(msg.text);
    committed = saved;
  });
  t.mock.method(Users, "findOne", async filter => {
    assert.equal(filter.email, "member@example.test");
    return user;
  });
  t.mock.method(Users, "updateOne", async (_filter, changes) => {
    if (saved) return { matchedCount: 0 };
    saved = changes.$set;
    return { matchedCount: 1 };
  });
  const [first, second] = [response(), response()];
  await Promise.all([
    login({ body: { email: "MEMBER@example.test" } }, first),
    requestNewCode({ body: { email: "member@example.test" } }, second),
  ]);
  assert.deepEqual([first.statusCode, second.statusCode].sort(), [200, 429]);
  assert.equal(issued.length, 1);
  assert.equal(committed, saved);
  assert.ok(await bcrypt.compare(/code is: (\\d{6})/.exec(issued[0])[1], saved.userotp));
});

test("failed SendGrid delivery retains atomic cooldown and does not return success", async t => {
  mockMail(t, async () => { throw new Error("mock provider unavailable"); });
  t.mock.method(Users, "findOne", async () => ({ _id: id, email: "user@example.test" }));
  let writes = 0;
  t.mock.method(Users, "updateOne", async () => { writes++; return { matchedCount: 1 }; });
  const res = response();
  await login({ body: { email: "user@example.test" } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(writes, 1, "Provider failure does not erase the saved attempt or permit immediate spam");
});

test("registration commits the new account and its OTP before sending email", async t => {
  let committed = null;
  let sendCount = 0;
  mockMail(t, async msg => {
    sendCount++;
    assert.ok(committed);
    const otp = /code is: (\\d{6})/.exec(msg.text)[1];
    assert.ok(await bcrypt.compare(otp, committed.userotp));
    assert.equal(committed.email, "new@example.test");
  });
  t.mock.method(Users, "findOne", async () => null);
  t.mock.method(Users.prototype, "save", async function () {
    committed = this;
    return this;
  });
  const before = process.env.PASSWORD_ENCRYPT_SECRET;
  process.env.PASSWORD_ENCRYPT_SECRET = "a".repeat(64);
  t.after(() => {
    if (before === undefined) delete process.env.PASSWORD_ENCRYPT_SECRET;
    else process.env.PASSWORD_ENCRYPT_SECRET = before;
  });
  const res = response();
  await register({ body: {
    firstName: "New", lastName: "Member", email: "NEW@example.test",
    username: "newmember", phone: "5145550184", password: "test-only-password",
  } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(sendCount, 1);
  assert.equal(committed.phone, "+15145550184");
  assert.ok(committed.lastOtpRequestedAt instanceof Date);
  assert.equal(committed.regTokenExpires.getTime() - committed.lastOtpRequestedAt.getTime(), EMAIL_OTP_LIFETIME_MS);
});

test("registration database failure never delivers an unusable verification code", async t => {
  let sends = 0;
  mockMail(t, async () => { sends++; });
  t.mock.method(Users, "findOne", async () => null);
  t.mock.method(Users.prototype, "save", async () => {
    const error = new Error("duplicate key");
    error.code = 11000;
    throw error;
  });
  const before = process.env.PASSWORD_ENCRYPT_SECRET;
  process.env.PASSWORD_ENCRYPT_SECRET = "a".repeat(64);
  t.after(() => {
    if (before === undefined) delete process.env.PASSWORD_ENCRYPT_SECRET;
    else process.env.PASSWORD_ENCRYPT_SECRET = before;
  });
  const res = response();
  await register({ body: {
    firstName: "New", lastName: "Member", email: "new@example.test",
    username: "newmember", phone: "5145550184", password: "test-only-password",
  } }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(sends, 0);
});
