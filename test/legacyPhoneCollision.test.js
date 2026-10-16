"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Users = require("../models/User");
const { login, requestNewCode, verifyOtp } = require("../controller/Auth");
const {
  findLegacyPhoneOtpUser, findUniqueLegacyPhoneUser,
  AmbiguousLegacyPhoneError,
} = require("../utils/legacyOtpAccount");

const ownerA = { _id: "507f1f77bcf86cd799439011", phone: "+15145550184" };
const ownerB = { _id: "507f1f77bcf86cd799439022", phone: "+15145550184" };
function mockPhoneLookup(t, found) {
  const projections = [];
  let calls = 0;
  t.mock.method(Users, "find", filter => {
    calls++;
    assert.deepEqual(filter, { phone: "+15145550184" });
    return {
      limit(value) {
        assert.equal(value, 2, "Never load an unrestricted collection by phone");
        return this;
      },
      select(fields) {
        projections.push(fields);
        return Promise.resolve(found.slice(0, 2));
      },
    };
  });
  return { calls: () => calls, projections };
}
function response() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

test("legacy phone lookup rejects duplicate identities instead of returning first record", async t => {
  const mock = mockPhoneLookup(t, [ownerA, ownerB]);
  await assert.rejects(findLegacyPhoneOtpUser("(514) 555-0184"), error =>
    error instanceof AmbiguousLegacyPhoneError && error.code === "AMBIGUOUS_LEGACY_PHONE");
  assert.equal(mock.calls(), 1);
  assert.ok(mock.projections[0].includes("+upmindClientId"));
  assert.ok(mock.projections[0].includes("+encryptedPassword"));
});

test("legacy SMS login, resend and verification fail closed before provider or account updates", async t => {
  const mock = mockPhoneLookup(t, [ownerA, ownerB]);
  let writes = 0;
  t.mock.method(Users, "updateOne", async () => {
    writes++;
    throw new Error("Duplicate number must never update one selected account");
  });
  for (const [handler, body] of [
    [login, { phone: "(514) 555-0184" }],
    [requestNewCode, { phone: "+15145550184" }],
    [verifyOtp, { phone: "5145550184", otp: "123456" }],
  ]) {
    const res = response();
    await handler({ body }, res);
    assert.equal(res.statusCode, 409);
    assert.match(res.body.error, /account review/);
  }
  assert.equal(mock.calls(), 3);
  assert.equal(writes, 0);
});

test("missing phone returns not-found, without sending OTP", async t => {
  mockPhoneLookup(t, []);
  const loginRes = response(), resendRes = response(), verifyRes = response();
  await login({ body: { phone: "5145550184" } }, loginRes);
  await requestNewCode({ body: { phone: "5145550184" } }, resendRes);
  await verifyOtp({ body: { phone: "5145550184", otp: "123456" } }, verifyRes);
  assert.equal(loginRes.statusCode, 401);
  assert.equal(resendRes.statusCode, 401);
  assert.equal(verifyRes.statusCode, 401);
});

test("unique matching phone still reaches atomic cooldown without loading secret Upmind fields", async t => {
  const mock = mockPhoneLookup(t, [{ ...ownerA, email: "owner@example.test" }]);
  t.mock.method(Users, "updateOne", async () => ({ matchedCount: 0 }));
  const res = response();
  await login({ body: { phone: "5145550184" } }, res);
  assert.equal(res.statusCode, 429);
  assert.equal(mock.projections[0], "_id phone email");
  assert.equal((await findUniqueLegacyPhoneUser("(514) 555-0184"))._id, ownerA._id);
});
