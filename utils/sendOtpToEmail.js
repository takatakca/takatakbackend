
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);


const sendOtpToEmail = async (email, otp) => {
  if (!email) throw new Error('Missing email');

  const msg = {
    to: email,
    from:`Takatak Team <${process.env.SENDER_EMAIL}>`,
    subject: 'OTP from Takatak Platform',
    text: `Your OTP is: ${otp}. It will expire in 5 minutes.
    
Don’t share this code with anyone.
Our employees will never ask for this code.`,
  };

  try {
    await sgMail.send(msg);
    // console.log(`OTP email sent to ${email}`);
  } catch (error) {
   console.error("SendGrid Email Error:");
    if (error.response) {
      console.error("Status Code:", error.code || error.response.statusCode);
      console.error("Response Body:", error.response.body);
      console.error("Headers:", error.response.headers);
    } else {
      console.error("Error Message:", error.message);
      console.error("Full Error Object:", error);
    }
    throw new Error("Failed to send OTP email (SendGrid error)");
  }
};

module.exports = sendOtpToEmail;












// const { google } = require("googleapis");

// const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
// const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
// const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
// const EMAIL_USER = process.env.EMAIL_USER;

// const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
// oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

// function createMessage(to, subject, body) {
//   const message = [
//     `From: "Takatak Team" <${EMAIL_USER}>`,
//     `To: ${to}`,
//     `Subject: ${subject}`,
//     "MIME-Version: 1.0",
//     "Content-Type: text/plain; charset=utf-8",
//     "",
//     body,
//   ].join("\n");

//   return Buffer.from(message)
//     .toString("base64")
//     .replace(/\+/g, "-")
//     .replace(/\//g, "_")
//     .replace(/=+$/, "");
// }

// const sendOtpToEmail = async (email, otp) => {
//   if (!email) throw new Error("Missing email");

//   try {
//     const subject = "OTP from Takatak platform";
//     const body = `Your OTP is: ${otp}. It will expire in 5 minutes.\n\nDon't share this code with anyone; our employees will never ask for this code.`;

//     const rawMessage = createMessage(email, subject, body);

//     const res = await gmail.users.messages.send({
//       userId: "me",
//       requestBody: { raw: rawMessage },
//     });

//     // console.log("Mail sent, message ID:", res.data.id);
//   } catch (err) {
//     console.error("Error sending OTP email via Gmail API:", err);
//     throw err;
//   }
// };

// module.exports = sendOtpToEmail;


