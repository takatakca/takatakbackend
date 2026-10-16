"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Users = require("../models/User");
const { login } = require("../controller/Auth");

test("legacy login throttles repeated SMS/email OTP requests using saved timestamp", async t => {
  t.mock.method(Users, "findOne", async () => ({
    _id: "507f1f77bcf86cd799439011",
    phone: "+15145550184",
    email: "someone@example.com",
    lastOtpRequestedAt: new Date(),
  }));
  let calls = 0;
  t.mock.method(Users, "updateOne", async (filter, update) => {
    calls++;
    assert.equal(filter._id, "507f1f77bcf86cd799439011");
    assert.ok(filter.$or.some(entry => entry.lastOtpRequestedAt?.$lte instanceof Date));
    assert.ok(update.$set.lastOtpRequestedAt instanceof Date);
    return { matchedCount: 0 };
  });
  async function check(body) {
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.response = value; return this; },
    };
    await login({ body }, res);
    assert.equal(res.statusCode, 429);
    assert.match(res.response.error, /wait/i);
  }
  await check({ phone: "(514) 555-0184" });
  await check({ email: "someone@example.com" });
  assert.equal(calls, 2, "Both request paths use MongoDB CAS");
});

test("invalid phone values return HTTP 400, not a server error", async () => {
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.response = value; return this; },
  };
  await login({ body: { phone: "not-a-number" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.response.error, /invalid phone/i);
});
