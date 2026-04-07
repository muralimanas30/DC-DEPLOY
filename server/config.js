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
    SMS_PROVIDER: readOptionalEnv("SMS_PROVIDER", "sms-gate"),
    SMS_GATE_BASE_URL: readOptionalEnv("SMS_GATE_BASE_URL", "https://api.sms-gate.app/3rdparty/v1"),
    SMS_GATE_AUTH_MODE: readOptionalEnv("SMS_GATE_AUTH_MODE", "basic"),
    SMS_GATE_USERNAME: readOptionalEnv("SMS_GATE_USERNAME"),
    SMS_GATE_PASSWORD: readOptionalEnv("SMS_GATE_PASSWORD"),
    SMS_GATE_ACCESS_TOKEN: readOptionalEnv("SMS_GATE_ACCESS_TOKEN"),
    SMS_GATE_DEFAULT_DEVICE_ID: readOptionalEnv("SMS_GATE_DEFAULT_DEVICE_ID"),
    SMS_GATE_DEFAULT_SIM_NUMBER: Number(readOptionalEnv("SMS_GATE_DEFAULT_SIM_NUMBER", 0)) || 0,
    SMS_GATE_SKIP_PHONE_VALIDATION: readOptionalEnv("SMS_GATE_SKIP_PHONE_VALIDATION", "false"),
    SMS_GATE_DEVICE_ACTIVE_WITHIN_HOURS: Number(readOptionalEnv("SMS_GATE_DEVICE_ACTIVE_WITHIN_HOURS", 0)) || 0,
    SMS_GATE_WEBHOOK_SIGNING_KEY: readOptionalEnv("SMS_GATE_WEBHOOK_SIGNING_KEY"),
    SMS_GATE_OUTBOUND_FROM: readOptionalEnv("SMS_GATE_OUTBOUND_FROM"),
    SMS_TEST_TARGET_PHONE: readOptionalEnv("SMS_TEST_TARGET_PHONE", "9848940005"),
    SMTP_HOST: readOptionalEnv("SMTP_HOST"),
    SMTP_PORT: Number(readOptionalEnv("SMTP_PORT", 587)) || 587,
    SMTP_SECURE: readOptionalEnv("SMTP_SECURE", "false"),
    SMTP_USER: readOptionalEnv("SMTP_USER"),
    SMTP_PASS: readOptionalEnv("SMTP_PASS"),
    EMAIL_FROM: readOptionalEnv("EMAIL_FROM"),
};
