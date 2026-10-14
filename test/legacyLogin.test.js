"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Users = require("../models/User");
const { login } = require("../controller/Auth");

test("legacy login throttles repeated SMS/email OTP requests using saved timestamp", async t => {
  t.mock.method(Users, "findOne", async () => ({
    phone: "+15145550184",
    email: "someone@example.com",
    lastOtpRequestedAt: new Date(),
  }));
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
