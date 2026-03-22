const User = require('../../models/User');
const { StatusCodes } = require('http-status-codes');
const { sendSuccess } = require('../../utils/response');

const checkUser = async (req, res, next) => {
    try {
        const { email } = req.body;

        const user = await User
            .findOne({ email })

        if (!user) {
            return sendSuccess(res, {
                statusCode: StatusCodes.OK,
                msg: "User availability checked",
                data: {
                    exists: false,
                },
            });
        }
        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "User availability checked",
            data: {
                exists: true,
                provider: user.provider,
            },
        });
    } catch (err) {
        next(err);
    }
};
module.exports = { checkUser }