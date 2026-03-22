const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');

const connectDB = async () => {
    if (!MONGO_URI) {
        throw new Error("Missing MONGO_URI in server/config");
    }

    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("[DB] CONNECTED:", mongoose.connection.host);
    return mongoose.connection;
};

module.exports = connectDB;
