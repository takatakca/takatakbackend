const mongoose = require('mongoose');

const usersSchema = new mongoose.Schema({
firstName : {
    type: String,
    required: true,
},
lastName : {
    type: String,
    required: true,
},
email : {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    match: [/.+\@.+\..+/, "Please enter a valid email"],
},

phone: {
    type: String,
    required: true,
    match: [/^\+?[1-9]\d{1,14}$/, "Please enter a valid phone number"],
},
password: {
  type: String,
  select: false,
},

  // encrypted plain password for Upmind (we decrypt & remove after creating Upmind client)
  encryptedPassword: { type: String, select: false, default: null },
 
regTokenExpires: {
    type: Date
},

isVerified: {
    type: Boolean,
    default: false,
    required: true,
},
verifiedAt: {
    type: Date
},

userotp: {
    type: String,
    select: false
},

lastOtpRequestedAt: {
  type: Date,
  default: null
},

username: {
    type: String,
},
role:{
    type: String,
    required: true,
    enum: ['admin', 'user'],
    default: 'user'
},
upmindClientId: { type: String, default: null, select: false },


phoneVerified: { type: Boolean, default: false },
refreshToken: { type: String, default: null, select: false },
lastAction: { type: String, enum: ["register", "login"], default: "register" },
lastActionAt: { type: Date, default: Date.now },

activity: [
  {
    action: { type: String, enum: ["register", "login"] },
    at: { type: Date, default: Date.now }
  }
]

}, {
    timestamps: true,
});

const Users = mongoose.model('Users', usersSchema);

module.exports = Users;