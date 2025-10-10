const express = require('express');
const connectdb = require('./config/connectDb')
const router = require('./routes/handler')
const cors = require('cors');
const env = require("dotenv");

env.config()
const app = express();

// ======================================
//  Gmail token keep-alive system to keep the refresh token active
// ======================================
require("./utils/tokenKeepAlive")

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(cors(
    {
        origin: "*"
    }
));

app.use("/", router);

const port = process.env.PORT || 3000;
app.listen(port, ()=>{
    connectdb();
    console.log(`server running on http://localhost:${port}`);
})