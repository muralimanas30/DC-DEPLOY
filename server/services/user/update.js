const { StatusCodes } = require("http-status-codes");
const { AppError } = require("../../errorHandler/errorHandler");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");

const updateUser = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select("+password");

        if (!user) {
            throw new AppError("User not found", StatusCodes.NOT_FOUND, "USER_NOT_FOUND");
        }

        let hasUpdates = false;

        /* ===========================
           Simple fields (loop)
           =========================== */
        const updatableFields = [
            "location",
            "isOnline",
            "assignedIncident",
            "lastSeen",
        ];

        for (const field of updatableFields) {
            if (req.body[field] !== undefined) {
                user[field] = req.body[field];
                hasUpdates = true;
            }
        }

        /* ===========================
           Active role (special case)
           =========================== */
        if (req.body.activeRole !== undefined) {
            if (!user.roles.includes(req.body.activeRole)) {
                throw new AppError(
                    "You do not have access to this role",
                    StatusCodes.FORBIDDEN,
                    "ROLE_ACCESS_DENIED"
                );
            }
            user.activeRole = req.body.activeRole;
            hasUpdates = true;
        }

        /* ===========================
           Password (special case)
           =========================== */
        if (req.body.password !== undefined) {
            if (user.oauth) {
                throw new AppError(
                    "OAuth users cannot change password",
                    StatusCodes.FORBIDDEN,
                    "OAUTH_PASSWORD_CHANGE_NOT_ALLOWED"
                );
            }

            if (req.body.password.length < 6) {
                throw new AppError(
                    "Password must be at least 6 characters",
                    StatusCodes.BAD_REQUEST,
                    "PASSWORD_TOO_SHORT"
                );
            }

            user.password = req.body.password;
            hasUpdates = true;
        }

        if (!hasUpdates) {
            throw new AppError("No valid fields to update", StatusCodes.BAD_REQUEST, "NO_VALID_FIELDS");
        }

        await user.save();

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "User updated successfully",
            data: {
                user: {
                    ...user.toObject(),
                },
            },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { updateUser };
