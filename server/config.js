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

function readOptionalEnv(name, fallback = null) {
    const value = process.env[name];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value;
    }

    return fallback;
}

module.exports = {
    NODE_ENV: process.env.NODE_ENV || "development",
    MONGO_URI: readEnv("MONGO_URI", "mongodb://localhost:27017/r"),
    PORT: Number(process.env.PORT || 8000),
    HOST: readOptionalEnv("HOST", "0.0.0.0"),
    JWT_SECRET: readEnv("JWT_SECRET", "dev-only-secret-change-me"),
    CORS_ORIGIN: readOptionalEnv("CORS_ORIGIN", "*"),
    TELEGRAM_BOT_TOKEN: readOptionalEnv("TELEGRAM_BOT_TOKEN"),
    TELEGRAM_BOT_USERNAME: readOptionalEnv("TELEGRAM_BOT_USERNAME"),
    TELEGRAM_WEBHOOK_SECRET: readOptionalEnv("TELEGRAM_WEBHOOK_SECRET"),
};
