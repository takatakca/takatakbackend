"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, PhoneNumberError } = require("../utils/phoneUtils");

test("normalizes Canadian and US national numbers to E.164 without +234", () => {
  assert.equal(normalizePhone("(514) 555-0184"), "+15145550184");
  assert.equal(normalizePhone("5145550184"), "+15145550184");
  assert.equal(normalizePhone("1 (416) 555-0184"), "+14165550184");
  assert.equal(normalizePhone("+1 514 555 0184"), "+15145550184");
});

test("preserves explicit international dialing codes including legacy Nigerian numbers", () => {
  assert.equal(normalizePhone("+33 6 12 34 56 78"), "+33612345678");
  assert.equal(normalizePhone("+234 803 555 1212"), "+2348035551212");
  assert.equal(normalizePhone("2348035551212"), "+2348035551212");
});

test("rejects ambiguous and malformed numbers instead of silently changing country", () => {
  for (const input of ["", "555-0184", "08035551212", "++15145550184", "tel:5145550184", "1000000000", "+0015145550184", "+1234567890123456", null, {}, undefined]) {
    assert.throws(() => normalizePhone(input), err => err instanceof PhoneNumberError && err.code === "INVALID_PHONE_NUMBER");
  }
});
