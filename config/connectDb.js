const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();


const connectstring = process.env.connectString;

async function connectdb(){
    await mongoose.connect(connectstring);
    console.log('database connection successful');
}

module.exports = connectdb;


// const mongoose = require("mongoose");

// const connectDb = async()=>{
//     try {
//         const connect = await mongoose.connect(process.env.CONNECTION_STRING);
//         console.log("Database connected: ", 
//             connect.connection.host,
//             connect.connection.port,
//             connect.connection.name
//         );
        
//     } catch (err) {
//         console.log(err);
//         process.exit(1);
        
//     }
// }

// module.exports = connectDb;