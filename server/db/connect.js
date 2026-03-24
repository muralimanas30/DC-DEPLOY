const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');
const { NODE_ENV } = require('../config');

const connectDB = async () => {
    if (!MONGO_URI) {
        throw new Error("Missing MONGO_URI in server/config");
    }

    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    if (NODE_ENV !== 'production') {
        console.log("[DB] CONNECTED:", mongoose.connection.host);
    }
    return mongoose.connection;
};

module.exports = connectDB;
