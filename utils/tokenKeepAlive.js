// require("dotenv").config();
// const { google } = require("googleapis");


// const oAuth2Client = new google.auth.OAuth2(
//   process.env.GMAIL_CLIENT_ID,
//   process.env.GMAIL_CLIENT_SECRET
// );


// oAuth2Client.setCredentials({
//   refresh_token: process.env.GMAIL_REFRESH_TOKEN,
// });


// async function keepAlive() {
//   try {
//     await oAuth2Client.getAccessToken();
//     console.log("Gmail token refreshed:", new Date().toISOString());
//   } catch (err) {
//     console.error("Gmail token refresh failed:", err.message);
//   }
// }

// // Run immediately when imported
// keepAlive();

// // Run weekly
// const ONE_WEEK = 1000 * 60 * 60 * 24 * 7;
// setInterval(keepAlive, ONE_WEEK);

// module.exports = keepAlive;
