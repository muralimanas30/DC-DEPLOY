const crypto = require("crypto");
const User = require('../../models/User');
const { StatusCodes } = require("http-status-codes");
const { AppError } = require("../../errorHandler/errorHandler");
const { signToken } = require("../../utils/token");
const { sendSuccess } = require('../../utils/response');
const oauthLogin = async (req, res, next) => {
    try {
        const { email, name, image, provider } = req.body;

        if (!email || !provider) {
            throw new AppError("Invalid OAuth payload (email, provider)", StatusCodes.BAD_REQUEST, "INVALID_OAUTH_PAYLOAD");
        }

        let user = await User.findOne({ email });

        // 🔹 Existing credentials user → BLOCK
        if (user && !user.oauth) {
            throw new AppError(
                "Email already registered with password login",
                StatusCodes.CONFLICT,
                "EMAIL_REGISTERED_WITH_PASSWORD"
            );
        }
        if(user && user.provider!=provider){
            throw new AppError(
                "Email already registered with different provider " + provider,
                StatusCodes.CONFLICT,
                "EMAIL_REGISTERED_WITH_DIFFERENT_PROVIDER"
            );
        }

        // 🔹 First-time OAuth user
        if (!user) {
            user = await User.create({
                email,
                name,
                image,
                oauth: true,
                provider,
                password: crypto.randomUUID(), // auto-hashed
            });
        }

        const token = signToken(user);

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "OAuth login successful",
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
module.exports = { oauthLogin };