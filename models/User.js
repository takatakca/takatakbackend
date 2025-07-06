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
    match: [ /.+\@.+\..+/]
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

username: {
    type: String,
},
role:{
    type: String,
    required: true,
    enum: ['admin', 'user'],
    default: 'user'
},

}, {
    timestamps: true,
});

const Users = mongoose.model('Users', usersSchema);

module.exports = Users;