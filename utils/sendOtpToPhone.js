// const client = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
// const { formatE164 } = require('./phoneUtils');

// module.exports = async function sendOtpToPhone(phone) {
//   const to = formatE164(phone);
//   await client.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).verifications.create({
//     to,
//     channel: 'sms',
//   });
// };

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


// const twilio = require('twilio')(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

// const sendOtpToPhone = async (phone, otp) => {
//     const formattedPhone = phone.startsWith('+') ? phone : `+${phone}`;

//         // Send OTP via Twilio WhatsApp
//         await twilio.messages.create({
//             from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
//             to: `whatsapp:${formattedPhone}`,
//             body: `Your takatak login code is: ${otp}`
//         });
//         return otp; // Return it so it will be store in DB
// }

// module.exports = sendOtpToPhone;