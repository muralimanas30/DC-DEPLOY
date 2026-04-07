const { StatusCodes } = require("http-status-codes");
const { AppError } = require("../../errorHandler/errorHandler");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");
const { normalizePhone } = require("../../utils/phone");

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
            "lastSeen",
            "phone",
        ];

        for (const field of updatableFields) {
            if (req.body[field] !== undefined) {
                if (field === "phone") {
                    const normalizedPhone = normalizePhone(req.body.phone);
                    if (req.body.phone && !normalizedPhone) {
                        throw new AppError("Invalid phone number. Use a 10-digit Indian mobile number.", StatusCodes.BAD_REQUEST, "INVALID_PHONE");
                    }

                    user.phone = normalizedPhone;
                    hasUpdates = true;
                    continue;
                }

                user[field] = req.body[field];
                hasUpdates = true;
            }
        }

        if (req.body.skills !== undefined) {
            if (!Array.isArray(req.body.skills)) {
                throw new AppError("Skills must be an array", StatusCodes.BAD_REQUEST, "INVALID_SKILLS");
            }

            const normalizedSkills = [...new Set(
                req.body.skills
                    .map((item) => String(item || "").trim())
                    .filter(Boolean)
            )];

            user.skills = normalizedSkills;
            hasUpdates = true;
        }

        /* ===========================
           Active role (special case)
           =========================== */
        if (req.body.activeRole !== undefined) {
            const requestedRole = String(req.body.activeRole || "").trim().toLowerCase();
            const allowedRoles = ["victim", "volunteer", "admin"];

            if (!allowedRoles.includes(requestedRole)) {
                throw new AppError(
                    "Invalid role",
                    StatusCodes.BAD_REQUEST,
                    "INVALID_ROLE"
                );
            }

            if (user.assignedIncident) {
                throw new AppError(
                    "You cannot change role while assigned to an active incident",
                    StatusCodes.FORBIDDEN,
                    "ROLE_SWITCH_BLOCKED_ASSIGNED_INCIDENT"
                );
            }

            if (!user.roles.includes(requestedRole)) {
                user.roles = [...new Set([...(user.roles || []), requestedRole])];
            }

            user.activeRole = requestedRole;
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
