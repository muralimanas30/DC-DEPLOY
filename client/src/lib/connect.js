const mongoose = require('mongoose');
const  MONGO_URI  = process.env.MONGO_URI;
const connectDB = async () => {
    if (!MONGO_URI) {
        throw new Error("Missing MONGO_URI in client env");
    }
    if(mongoose.connection.readyState===1)
        return mongoose
    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    if (process.env.NODE_ENV !== "production") {
        console.log("[DB] CONNECTED:", mongoose.connection.host);
    }
    return mongoose.connection;
};

module.exports = connectDB;
