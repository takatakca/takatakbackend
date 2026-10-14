"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Users = require("../models/User");
const { findLegacyPhoneOtpUser } = require("../utils/legacyOtpAccount");
const { consumeEmailOtp } = require("../utils/emailOtpAttempts");
const { encrypt, decrypt, getEncryptionKey } = require("../utils/crypto");

test("phone OTP loads hidden Upmind account linkage rather than creating duplicate clients", async t => {
  let query, projection;
  t.mock.method(Users, "findOne", filter => {
    query = filter;
    return {
      select(fields) {
        projection = fields;
        return Promise.resolve({ phone: "+15145550184", upmindClientId: "existing-client" });
      },
    };
  });
  const user = await findLegacyPhoneOtpUser("(514) 555-0184");
  assert.equal(query.phone, "+15145550184");
  assert.ok(projection.includes("+upmindClientId"));
  assert.ok(projection.includes("+encryptedPassword"));
  assert.equal(user.upmindClientId, "existing-client");
});

test("email OTP atomic consumption selects stored Upmind association", async () => {
  let selected;
  const mockUser = { _id: "507f1f77bcf86cd799439011", userotp: "hashed", isVerified: true };
  const fakeModel = {
    findOneAndUpdate() {
      return { select(fields) { selected = fields; return Promise.resolve(mockUser); } };
    },
  };
  await consumeEmailOtp(fakeModel, mockUser);
  assert.ok(selected.includes("+upmindClientId"));
  assert.ok(selected.includes("+encryptedPassword"));
});

test("legacy AES ciphertext remains decryptable with correctly formatted external secret", t => {
  const before = process.env.PASSWORD_ENCRYPT_SECRET;
  process.env.PASSWORD_ENCRYPT_SECRET = "b".repeat(64);
  t.after(() => {
    if (before === undefined) delete process.env.PASSWORD_ENCRYPT_SECRET;
    else process.env.PASSWORD_ENCRYPT_SECRET = before;
  });
  const first = encrypt("Upmind legacy credential");
  const second = encrypt("Upmind legacy credential");
  assert.notEqual(first, second, "each credential requires a unique random IV");
  assert.equal(decrypt(first), "Upmind legacy credential");
  assert.equal(getEncryptionKey().length, 32);
  const parts = first.split(":");
  assert.equal(parts[0].length, 32);
  assert.equal(parts[1].length, 32);
  assert.throws(() => decrypt(parts[0] + ":" + "0".repeat(32) + ":" + parts[2]));
  assert.throws(() => decrypt("not:a:credential"), /Invalid encrypted credential/);
});

test("secret validation is lazy and rejects missing or malformed keys", t => {
  const previous = process.env.PASSWORD_ENCRYPT_SECRET;
  t.after(() => {
    if (previous === undefined) delete process.env.PASSWORD_ENCRYPT_SECRET;
    else process.env.PASSWORD_ENCRYPT_SECRET = previous;
  });
  delete process.env.PASSWORD_ENCRYPT_SECRET;
  assert.throws(() => encrypt("temporary"), /32-byte hex secret/);
  process.env.PASSWORD_ENCRYPT_SECRET = "invalid-secret";
  assert.throws(() => decrypt("a".repeat(32) + ":" + "b".repeat(32) + ":" + "ab"), /32-byte hex secret/);
  assert.throws(() => encrypt(""), TypeError);
});
