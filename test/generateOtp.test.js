"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const generateOtp = require("../utils/generateOtp");

test("legacy email OTPs use six cryptographically random numeric digits", () => {
  const samples = Array.from({ length: 64 }, () => generateOtp());
  for (const code of samples) {
    assert.match(code, /^[1-9]\d{5}$/);
  }
  // Extremely unlikely under a CSPRNG; catches a broken constant generator.
  assert.ok(new Set(samples).size > 60);
});
