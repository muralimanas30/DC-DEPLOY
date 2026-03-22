const { StatusCodes } = require("http-status-codes");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");

const createIncident = async (req, res, next) => {
    try {
        const { title, description, category, severity, location } = req.body;

        if (!title || !description) {
            throw new AppError("Title and description are required", StatusCodes.BAD_REQUEST, "MISSING_INCIDENT_FIELDS");
        }

        const creatorId = req.user?.id || req.user?._id;
        if (!creatorId) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const creator = await User.findById(creatorId);
        if (!creator) {
            throw new AppError("User not found", StatusCodes.NOT_FOUND, "USER_NOT_FOUND");
        }

        const creatorRole = creator.activeRole || req.user?.activeRole || "victim";

        if (creatorRole === "victim" && creator.assignedIncident) {
            const assignedIncident = await Incident.findById(creator.assignedIncident);

            if (!assignedIncident) {
                creator.assignedIncident = null;
                await creator.save();
            } else {
                const activeStatuses = ["active"];
                if (activeStatuses.includes(assignedIncident.status)) {
                    throw new AppError(
                        "You already have an active incident. Resolve it before creating another.",
                        StatusCodes.CONFLICT,
                        "ACTIVE_INCIDENT_EXISTS"
                    );
                }

                creator.assignedIncident = null;
                await creator.save();
            }
        }

        const incident = await Incident.create({
            title,
            description,
            category,
            severity,
            location,
            creatorId,
            creatorRole,
            victims: creatorRole === "victim" ? [creator._id] : [],
            volunteers: creatorRole === "volunteer" ? [creator._id] : [],
            admins: creatorRole === "admin" ? [creator._id] : [],
        });

        if (creatorRole === "victim") {
            creator.assignedIncident = incident._id;
            await creator.save();
        }

        return sendSuccess(res, {
            statusCode: StatusCodes.CREATED,
            msg: "Incident created successfully",
            data: {
                incident,
            },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { createIncident };
