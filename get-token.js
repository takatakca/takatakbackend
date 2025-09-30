require("dotenv").config();
const { google } = require("googleapis");
const express = require("express");

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3001/oauth2callback";

const app = express();
// console.log("Client ID:", process.env.GMAIL_CLIENT_ID);

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Step 1: Visit this URL to grant access
app.get("/auth/google", (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://mail.google.com/"],
    prompt: "consent",
  });
  res.redirect(url);
});

// Step 2: Google redirects here with ?code=
app.get("/oauth2callback", async (req, res) => {
  const { code } = req.query;
  const { tokens } = await oauth2Client.getToken(code);
  console.log("✅ Tokens:", tokens);
  res.send("Check your terminal for tokens!");
});

app.listen(3001, () => console.log("Go to http://localhost:3001/auth/google"));
