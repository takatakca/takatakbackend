"use strict";
const { normalizePhone } = require("./phoneUtils");

// Do not initialize the Twilio client at module import: health/startup routes
// must work without legacy OTP credentials once the cutover is completed.
function getVerifyClient() {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) {
    throw new Error("Twilio Verify is not configured");
  }
  const client = require("twilio")(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return client.verify.v2.services(TWILIO_VERIFY_SERVICE_SID);
}

async function sendOtpToPhone(phone) {
  return getVerifyClient().verifications.create({
    to: normalizePhone(phone),
    channel: "sms",
  });
}

async function checkOtpFromPhone(phone, code) {
  const result = await getVerifyClient().verificationChecks.create({
    to: normalizePhone(phone),
    code,
  });
  // Legacy controller expects a boolean `valid` flag, not Twilio's status string.
  return { ...result, valid: result.status === "approved" };
}

module.exports = { sendOtpToPhone, checkOtpFromPhone };
