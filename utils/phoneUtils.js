"use strict";

class PhoneNumberError extends TypeError {
  constructor() {
    super("Phone number must be a valid E.164 number or a 10-digit Canadian/US number");
    this.name = "PhoneNumberError";
    this.code = "INVALID_PHONE_NUMBER";
  }
}

// Preserve explicit international country codes. Never implicitly prepend
// Nigeria (+234) to Canadian or other numbers as the previous version did.
// Legacy bare Nigerian international numbers are accepted for compatibility;
// local Nigerian 0-prefixed numbers must now specify their full +234 number.
function normalizePhone(phone) {
  if (typeof phone !== "string" && typeof phone !== "number") {
    throw new PhoneNumberError();
  }
  const raw = String(phone).trim();
  if (!raw || !/^\+?[\d\s().-]+$/.test(raw)) {
    throw new PhoneNumberError();
  }
  const digits = raw.replace(/\D/g, "");
  let international;

  if (raw.startsWith("+")) {
    international = digits;
  } else if (digits.length === 10) {
    international = "1" + digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    international = digits;
  } else if (digits.length === 13 && digits.startsWith("234")) {
    // Existing customers occasionally use an unprefixed +234 E.164 form.
    international = digits;
  } else {
    throw new PhoneNumberError();
  }

  if (!/^[1-9]\d{1,14}$/.test(international)) {
    throw new PhoneNumberError();
  }

  // A North American country code must have exactly ten national digits,
  // beginning with a valid area code (not a leading 0 or 1).
  if (international.startsWith("1") &&
      (international.length !== 11 || !/^[2-9]/.test(international.slice(1)))) {
    throw new PhoneNumberError();
  }
  return "+" + international;
}

module.exports = { normalizePhone, PhoneNumberError };
