const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const connectString = process.env.MONGO_URI;

async function connectdb() {
  if (!connectString) {
    throw new Error("MongoDB connection string (MONGO_URI) is not defined in environment variables.");
  }

  await mongoose.connect(connectString);
  console.log('Database connection successful');
}

module.exports = connectdb;



// const mongoose = require('mongoose');
// const dotenv = require('dotenv');
// dotenv.config();


// const connectstring = process.env.connectString;

// async function connectdb(){
//     await mongoose.connect(connectstring);
//     console.log('database connection successful');
// }

// module.exports = connectdb;
