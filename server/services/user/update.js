const { StatusCodes } = require("http-status-codes");
const { AppError } = require("../../errorHandler/errorHandler");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");

const updateUser = async (req, res, next) => {
    try {
        const candidateIds = [
            req.userId,
            req.user?.id,
            req.user?._id,
            req.params?.id,
        ].filter(Boolean).map((id) => id.toString());

        if (!candidateIds.length) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        let user = null;
        for (const id of [...new Set(candidateIds)]) {
            // Skip malformed ObjectIds and keep trying other candidate sources.
            if (!/^[a-f\d]{24}$/i.test(id)) {
                continue;
            }
            user = await User.findById(id).select("+password");
            if (user) break;
        }

        if (!user) {
            throw new AppError("User not found", StatusCodes.NOT_FOUND, "USER_NOT_FOUND");
        }

        let hasUpdates = false;

        /* ===========================
           Simple fields (loop)
           =========================== */
        const updatableFields = [
            "location",
            "currentLocation",
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
