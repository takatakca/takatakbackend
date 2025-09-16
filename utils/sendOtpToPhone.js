const client = require("twilio")(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const { normalizePhone } = require("./phoneUtils");

// Send OTP via Twilio Verify service
async function sendOtpToPhone(phone) {
  const to = normalizePhone(phone);

  return await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID)
    .verifications.create({
      to,
      channel: "sms",
    });
}

async function checkOtpFromPhone(phone, code) {
  const to = normalizePhone(phone);

  return await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID)
    .verificationChecks.create({
      to,
      code,
    });
}

module.exports = { sendOtpToPhone, checkOtpFromPhone };