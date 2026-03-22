const { StatusCodes } = require('http-status-codes');
const { AppError } = require('../../errorHandler/errorHandler');
const User = require('../../models/User');
const { signToken } = require('../../utils/token');
const { sendSuccess } = require('../../utils/response');
const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

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
            throw new AppError(
                "This account uses OAuth login",
                StatusCodes.UNAUTHORIZED,
                "OAUTH_ACCOUNT_LOGIN_REQUIRED"
            );
        }

        const isValid = await user.isMatch(password);
        if (!isValid) {
            throw new AppError("Invalid credentials", StatusCodes.UNAUTHORIZED, "INVALID_CREDENTIALS");
        }

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