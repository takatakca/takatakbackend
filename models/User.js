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
},
 
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
    type: String
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
upmindClientId: { type: String, default: null },

phoneVerified: { type: Boolean, default: false },
refreshToken: { type: String, default: null },

}, {
    timestamps: true,
});

const Users = mongoose.model('Users', usersSchema);

module.exports = Users;