const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');
const { NODE_ENV } = require('../config');
const { logger } = require('../utils/logger');

const connectDB = async () => {
    if (!MONGO_URI) {
        throw new Error("Missing MONGO_URI in server/config");
    }

    logger.db(`Connecting to MongoDB (${logger.highlight(NODE_ENV)})...`);

    await mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    logger.success('db', `Connected to MongoDB at ${logger.highlight(mongoose.connection.host)}`);
    return mongoose.connection;
};

module.exports = connectDB;
