const { StatusCodes } = require("http-status-codes");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
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

        const creatorRole = req.user?.activeRole || "victim";

        const incident = await Incident.create({
            title,
            description,
            category,
            severity,
            location,
            creatorId,
            creatorRole,
            victimCount: creatorRole === "victim" ? 1 : 0,
            volunteerCount: creatorRole === "volunteer" ? 1 : 0,
            adminCount: creatorRole === "admin" ? 1 : 0,
            activeParticipantCount: 1,
        });

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
