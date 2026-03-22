const { StatusCodes } = require("http-status-codes");

function sendSuccess(res, {
    statusCode = StatusCodes.OK,
    msg = "Request successful",
    data = null,
    meta = undefined,
}) {
    const payload = {
        status: "success",
        statusCode,
        msg,
        data,
        traceId: res?.locals?.traceId,
        timestamp: new Date().toISOString(),
    };

    if (meta !== undefined) {
        payload.meta = meta;
    }

    return res.status(statusCode).json(payload);
}

module.exports = { sendSuccess };
