const express = require('express');
const app = express();
const connectdb = require('./config/connectDb')
const router = require('./routes/handler')
const cors = require('cors');
const env = require("dotenv");

env.config()
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use(cors(
    {
        cors: "*"
    }
));

app.use("/", router);

const port = process.env.PORT || 3000;
app.listen(port, ()=>{
    connectdb();
    console.log(`server running on http://localhost:${port}`);
})