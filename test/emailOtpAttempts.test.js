"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const Users = require("../models/User");
const { verifyOtp } = require("../controller/Auth");
const { MAX_EMAIL_OTP_ATTEMPTS, reserveEmailOtpAttempt, consumeEmailOtp } = require("../utils/emailOtpAttempts");

function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("legacy email verification enforces five failed attempts before lockout", async t => {
  const hash = await bcrypt.hash("123456", 4);
  const pending = {
    _id: "507f1f77bcf86cd799439011",
    email: "member@example.com",
    userotp: hash,
    otpAttempts: 0,
    regTokenExpires: new Date(Date.now() + 300_000),
    isVerified: false,
  };
  let reservations = 0;
  t.mock.method(Users, "findOne", () => ({ select: async () => pending }));
  t.mock.method(Users, "findOneAndUpdate", (filter, changes) => ({
    select: async () => {
      assert.equal(filter._id, pending._id);
      assert.equal(filter.userotp, hash);
      assert.equal(changes.$inc.otpAttempts, 1);
      if (pending.otpAttempts >= MAX_EMAIL_OTP_ATTEMPTS) return null;
      pending.otpAttempts++;
      reservations++;
      return { ...pending };
    },
  }));

  for (let i = 0; i < MAX_EMAIL_OTP_ATTEMPTS; i++) {
    const res = response();
    await verifyOtp({ body: { email: "member@example.com", otp: "999999" } }, res);
    assert.equal(res.statusCode, 400);
  }
  const blocked = response();
  await verifyOtp({ body: { email: "member@example.com", otp: "123456" } }, blocked);
  assert.equal(blocked.statusCode, 429);
  assert.equal(reservations, MAX_EMAIL_OTP_ATTEMPTS);
  assert.ok(Users.schema.path("otpAttempts"));
});

test("invalid email OTP shape cannot reach database verification", async t => {
  let queried = false;
  t.mock.method(Users, "findOne", () => { queried = true; throw new Error("Must not query"); });
  const res = response();
  await verifyOtp({ body: { email: "member@example.com", otp: "abcdef" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test("single-use OTP reservation and consumption carry atomic MongoDB guards", async () => {
  const user = {
    _id: "507f1f77bcf86cd799439011",
    userotp: "hash",
    isVerified: false,
  };
  const queries = [];
  const fake = {
    findOneAndUpdate(query, updates, options) {
      queries.push({ query, updates, options });
      return { select: async () => user };
    },
  };
  await reserveEmailOtpAttempt(fake, user);
  await consumeEmailOtp(fake, user);
  assert.deepEqual(queries[0].updates, { $inc: { otpAttempts: 1 } });
  assert.deepEqual(queries[0].query.$or[0], { otpAttempts: { $lt: 5 } });
  assert.equal(queries[1].query.userotp, "hash");
  assert.equal(queries[1].updates.$unset.userotp, 1);
  assert.equal(queries[1].updates.$set.isVerified, true);
  assert.equal(queries[1].updates.$set.otpAttempts, 0);
  assert.equal(queries[1].updates.$push.activity.action, "register");
});

test("expired OTP cleanup is conditioned on the stale hash and expiry, not a stale document save", async t => {
  const stale = {
    _id: "507f1f77bcf86cd799439011",
    userotp: "stale-email-otp-hash",
    regTokenExpires: new Date(Date.now() - 60_000),
    save() { throw new Error("Unconditional save could erase a concurrently issued code"); },
  };
  let filter, changes;
  t.mock.method(Users, "findOne", () => ({ select: async () => stale }));
  t.mock.method(Users, "updateOne", async (query, update) => {
    filter = query;
    changes = update;
    return { matchedCount: 0, modifiedCount: 0 };
  });
  const res = response();
  await verifyOtp({ body: { email: "member@example.com", otp: "123456" } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(filter._id, stale._id);
  assert.equal(filter.userotp, stale.userotp);
  assert.ok(filter.$or.some(entry => entry.regTokenExpires?.$lte instanceof Date));
  assert.equal(changes.$unset.userotp, 1);
  assert.equal(changes.$set.otpAttempts, 0);
});
