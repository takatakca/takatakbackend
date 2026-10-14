"use strict";
const sgMail = require("@sendgrid/mail");

async function sendOtpToEmail(email, otp) {
  if (!email || !otp) throw new Error("Missing email or OTP");
  if (!process.env.SENDGRID_API_KEY || !process.env.SENDER_EMAIL) {
    throw new Error("SendGrid OTP email is not configured");
  }

  // Initialize only on email delivery, not on health-route startup.
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  const msg = {
    to: email,
    from: `Takatak Team <${process.env.SENDER_EMAIL}>`,
    subject: "TAKATAK verification code",
    text: `Your verification code is: ${otp}. It expires in 5 minutes.\n\nNever share this code; TAKATAK staff will not ask for it.`,
  };
  try {
    await sgMail.send(msg);
  } catch (err) {
    // Avoid logging recipients, message contents and request credentials.
    console.error("SendGrid OTP delivery failed:", err.code || err.message);
    throw new Error("Failed to send OTP email");
  }
}

module.exports = sendOtpToEmail;
