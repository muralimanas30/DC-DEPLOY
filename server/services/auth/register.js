const { StatusCodes } = require('http-status-codes');
const { AppError } = require('../../errorHandler/errorHandler');
const User = require('../../models/User')
const { signToken } = require('../../utils/token')
const { sendSuccess } = require('../../utils/response');

const register = async (req, res, next) => {
    try {
        const { email, password, name, provider, oauth } = req.body;
        if (!email || !password) {
            throw new AppError("Email and password are required", StatusCodes.BAD_REQUEST, "MISSING_CREDENTIALS");
        }

        const exists = await User.findOne({ email });
        if (exists) {
            throw new AppError("Email already registered", StatusCodes.CONFLICT, "EMAIL_ALREADY_REGISTERED");
        }

        const user = await User.create({
            email, password, name, provider, oauth
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