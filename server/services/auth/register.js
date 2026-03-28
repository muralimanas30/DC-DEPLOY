const { StatusCodes } = require('http-status-codes');
const { AppError } = require('../../errorHandler/errorHandler');
const User = require('../../models/User')
const { signToken } = require('../../utils/token')
const { sendSuccess } = require('../../utils/response');
const { normalizePhone } = require('../../utils/phone');
const { normalizeTelegramId, normalizeTelegramUsername } = require('../../utils/telegram');

const ALLOWED_ROLES = ["victim", "volunteer", "admin"];

const register = async (req, res, next) => {
    try {
        const {
            email,
            password,
            name,
            provider,
            oauth,
            role,
            roles,
            activeRole,
            phone,
            telegramId,
            telegramUsername,
        } = req.body;
        if (!email || !password) {
            throw new AppError("Email and password are required", StatusCodes.BAD_REQUEST, "MISSING_CREDENTIALS");
        }

        const exists = await User.findOne({ email });
        if (exists) {
            throw new AppError("Email already registered", StatusCodes.CONFLICT, "EMAIL_ALREADY_REGISTERED");
        }

        const requestedRoles = Array.isArray(roles)
            ? roles
            : (role ? [role] : ["victim"]);
        const normalizedRoles = [...new Set(requestedRoles.filter((item) => ALLOWED_ROLES.includes(item)))];

        if (!normalizedRoles.length) {
            throw new AppError("Invalid role selection", StatusCodes.BAD_REQUEST, "INVALID_ROLE_SELECTION");
        }

        const resolvedActiveRole = activeRole || role || normalizedRoles[0] || "victim";
        if (!normalizedRoles.includes(resolvedActiveRole)) {
            throw new AppError("activeRole must be included in roles", StatusCodes.BAD_REQUEST, "INVALID_ACTIVE_ROLE");
        }

        const normalizedPhone = phone ? normalizePhone(phone) : null;
        if (phone && !normalizedPhone) {
            throw new AppError('Invalid phone number format', StatusCodes.BAD_REQUEST, 'INVALID_PHONE');
        }

        const normalizedTelegramId = telegramId ? normalizeTelegramId(telegramId) : null;
        if (telegramId && !normalizedTelegramId) {
            throw new AppError('Invalid telegram id format', StatusCodes.BAD_REQUEST, 'INVALID_TELEGRAM_ID');
        }

        const normalizedTelegramUsername = telegramUsername
            ? normalizeTelegramUsername(telegramUsername)
            : null;
        if (telegramUsername && !normalizedTelegramUsername) {
            throw new AppError('Invalid telegram username format', StatusCodes.BAD_REQUEST, 'INVALID_TELEGRAM_USERNAME');
        }

        const user = await User.create({
            email,
            password,
            name,
            provider,
            oauth,
            roles: normalizedRoles,
            activeRole: resolvedActiveRole,
            phone: normalizedPhone,
            telegramId: normalizedTelegramId,
            telegramUsername: normalizedTelegramUsername,
        });

        const token = signToken(user);

        return sendSuccess(res, {
            statusCode: StatusCodes.CREATED,
            msg: "Registration successful",
            data: {
                user: {
                    ...user.toObject(),
                    id: user._id,
                },
                token,
            },
        });
    } catch (err) {
        next(err);
    }
};
module.exports = { register }