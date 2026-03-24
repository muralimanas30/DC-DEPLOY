require('dotenv').config();

const isProduction = process.env.NODE_ENV === "production";

function readEnv(name, fallback = null) {
    const value = process.env[name];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
        return value;
    }

    if (!isProduction && fallback !== null) {
        return fallback;
    }

    throw new Error(`Missing required environment variable: ${name}`);
}

module.exports = {
    NODE_ENV: process.env.NODE_ENV || "development",
    MONGO_URI: readEnv("MONGO_URI", "mongodb://localhost:27017/r"),
    PORT: Number(process.env.PORT || 8000),
    JWT_SECRET: readEnv("JWT_SECRET", "dev-only-secret-change-me"),
    CORS_ORIGIN: process.env.CORS_ORIGIN || "http://localhost:3000",
};
