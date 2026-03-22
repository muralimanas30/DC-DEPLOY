const { StatusCodes, getReasonPhrase } = require("http-status-codes");

class AppError extends Error {
    constructor(message, statusCode = StatusCodes.INTERNAL_SERVER_ERROR, code = "INTERNAL_ERROR", details = null) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

const errorHandler = (err, req, res, next) => {
    const statusCode = err?.statusCode || StatusCodes.INTERNAL_SERVER_ERROR;
    const message = err?.message || getReasonPhrase(StatusCodes.INTERNAL_SERVER_ERROR);

    const payload = {
        status: "error",
        statusCode,
        msg: message,
        code: err?.code || "INTERNAL_ERROR",
        details: err?.details || undefined,
        traceId: res?.locals?.traceId,
        timestamp: err?.timestamp || new Date().toISOString(),
    };

    res.status(statusCode).json(payload);
};

module.exports = {
    AppError,
    CustomError: AppError,
    errorHandler,
};
