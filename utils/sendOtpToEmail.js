const nodemailer = require("nodemailer");
const { google } = require("googleapis");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

const sendOtpToEmail = async (email, otp) => {
  if (!email) throw new Error("Missing email");

  try {
    const accessToken = await oAuth2Client.getAccessToken();
     console.log("Access token received:", accessToken?.token);

    const mailTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        type: "OAuth2",
        user: process.env.EMAIL_USER,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        refreshToken: REFRESH_TOKEN,
        accessToken: accessToken.token,
      },
    });

    await mailTransporter.sendMail({
      from: `"Takatak Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'OTP from Takatak platform',
      text: `Your OTP is: ${otp}. It will expire in 5 minutes.\n \nDon't share this code with anyone;\n Our employees will never ask for this code`
    });
     console.log("Mail sent successfully");


     console.log("ENV check:", {
  EMAIL_USER: process.env.EMAIL_USER,
  CLIENT_ID: !!process.env.GMAIL_CLIENT_ID,
  CLIENT_SECRET: !!process.env.GMAIL_CLIENT_SECRET,
  REFRESH_TOKEN: !!process.env.GMAIL_REFRESH_TOKEN,
});


  } catch (err) {
    console.error("Full error:", err);

    // console.error("Error sending OTP email:", err.message);
    throw err;
  }
};

module.exports = sendOtpToEmail;




// const nodemailer = require('nodemailer');


//         // Send OTP via email
//         const mailTransporter = nodemailer.createTransport({
//             service: 'gmail',
//             host: "smtp.gmail.com",
//             port: 587,
//             secure: false,
//             auth: {
//                 user: `${process.env.EMAIL_USER}`,              
//                 pass: `${process.env.EMAIL_PASS}`

//             },
//         });

//     const sendOtpToEmail = async (email, otp) => {
//         if (!email) throw new Error('Missing email');
//         await mailTransporter.sendMail({
//             from: `"Takatak Team" <${process.env.EMAIL_USER}> `,
//             to: email,
//             subject: 'OTP from Takatak platform',
//             text: `Your OTP is: ${otp}. It will expire in 5 minutes.\n \nDon't share this code with anyone;\n Our employees will never ask for this code`
//         });
//     };

//     module.exports = sendOtpToEmail