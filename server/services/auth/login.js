const { StatusCodes } = require('http-status-codes');
const { AppError } = require('../../errorHandler/errorHandler');
const User = require('../../models/User');
const { signToken } = require('../../utils/token');
const { sendSuccess } = require('../../utils/response');
const { sendEmail } = require('../email');
const { logger } = require('../../utils/logger');

const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const FAILED_LOGIN_THRESHOLD = 5;
const FAILED_LOGIN_ALERT_COOLDOWN_MS = 30 * 60 * 1000;

const failedLoginBuckets = new Map();
const failedLoginAlertCooldownByEmail = new Map();
const successfulLoginFingerprintByUserId = new Map();

const fireAndForget = (promise, label) => {
    promise.catch((error) => {
        logger.error('security', `${label} failed`, error?.message || error);
    });
};

const getRequestIp = (req) => {
    const xff = req.headers?.['x-forwarded-for'];
    if (xff) {
        return String(xff).split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
};

const getUserAgent = (req) => String(req.headers?.['user-agent'] || 'unknown').slice(0, 300);

const buildLoginFingerprint = (req) => `${getRequestIp(req)}|${getUserAgent(req)}`;

const recordFailedAttempt = ({ email, ip }) => {
    const now = Date.now();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return 0;

    const key = `${normalizedEmail}|${String(ip || 'unknown')}`;
    const existing = failedLoginBuckets.get(key) || [];
    const recent = existing.filter((stamp) => now - stamp <= FAILED_LOGIN_WINDOW_MS);
    recent.push(now);
    failedLoginBuckets.set(key, recent);
    return recent.length;
};

const clearFailedAttemptsFor = ({ email, ip }) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return;
    const key = `${normalizedEmail}|${String(ip || 'unknown')}`;
    failedLoginBuckets.delete(key);
};

const shouldSendFailedLoginAlert = (email) => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return false;

    const now = Date.now();
    const lastSentAt = failedLoginAlertCooldownByEmail.get(normalizedEmail) || 0;
    if (now - lastSentAt < FAILED_LOGIN_ALERT_COOLDOWN_MS) {
        return false;
    }

    failedLoginAlertCooldownByEmail.set(normalizedEmail, now);
    return true;
};

const maybeNotifyFailedLoginSpike = async ({ user, req, attemptCount }) => {
    if (!user?.email) return;
    if (attemptCount < FAILED_LOGIN_THRESHOLD) return;
    if (!shouldSendFailedLoginAlert(user.email)) return;

    const ip = getRequestIp(req);
    const ua = getUserAgent(req);
    await sendEmail({
        to: user.email,
        subject: 'Security alert: failed login attempts detected',
        text: `We detected multiple failed login attempts on your account.\n\nAttempts (last 15 min): ${attemptCount}\nIP: ${ip}\nDevice: ${ua}\nTime: ${new Date().toISOString()}\n\nIf this was not you, please reset your password immediately.`,
        meta: {
            channel: 'security-failed-login-spike',
            userId: user._id?.toString?.() || null,
            attemptCount,
            ip,
        },
    });
};

const maybeNotifyNewDeviceLogin = async ({ user, req }) => {
    if (!user?._id || !user?.email) return;

    const userId = user._id.toString();
    const fingerprint = buildLoginFingerprint(req);
    const previous = successfulLoginFingerprintByUserId.get(userId);
    successfulLoginFingerprintByUserId.set(userId, fingerprint);

    if (!previous || previous === fingerprint) {
        return;
    }

    const ip = getRequestIp(req);
    const ua = getUserAgent(req);
    await sendEmail({
        to: user.email,
        subject: 'Security notice: new login/device detected',
        text: `A login from a new device or network was detected on your account.\n\nIP: ${ip}\nDevice: ${ua}\nTime: ${new Date().toISOString()}\n\nIf this was not you, please secure your account immediately.`,
        meta: {
            channel: 'security-new-device-login',
            userId,
            ip,
        },
    });
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        const requestIp = getRequestIp(req);

        if (!email || !password) {
            throw new AppError("Email and password are required", StatusCodes.BAD_REQUEST, "MISSING_CREDENTIALS");
        }

        const user = await User
            .findOne({ email })
            .select("+password");

        if (!user) {
            throw new AppError("Invalid credentials", StatusCodes.UNAUTHORIZED, "INVALID_CREDENTIALS");
        }

        // 🔐 BLOCK OAUTH USERS
        if (user.oauth == true) {
            const attempts = recordFailedAttempt({ email: user.email, ip: requestIp });
            fireAndForget(
                maybeNotifyFailedLoginSpike({ user, req, attemptCount: attempts }),
                'failed-login-spike-oauth'
            );
            throw new AppError(
                "This account uses OAuth login",
                StatusCodes.UNAUTHORIZED,
                "OAUTH_ACCOUNT_LOGIN_REQUIRED"
            );
        }

        const isValid = await user.isMatch(password);
        if (!isValid) {
            const attempts = recordFailedAttempt({ email: user.email, ip: requestIp });
            fireAndForget(
                maybeNotifyFailedLoginSpike({ user, req, attemptCount: attempts }),
                'failed-login-spike-password'
            );
            throw new AppError("Invalid credentials", StatusCodes.UNAUTHORIZED, "INVALID_CREDENTIALS");
        }

        clearFailedAttemptsFor({ email: user.email, ip: requestIp });
        fireAndForget(
            maybeNotifyNewDeviceLogin({ user, req }),
            'new-device-login'
        );

        const token = signToken(user);

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Login successful",
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
module.exports = { login }