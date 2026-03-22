const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");

const getIncidentById = async (req, res, next) => {
    try {
        const { incidentId } = req.params;

        if (!mongoose.Types.ObjectId.isValid(incidentId)) {
            throw new AppError("Invalid incident id", StatusCodes.BAD_REQUEST, "INVALID_INCIDENT_ID");
        }

        const incident = await Incident.findById(incidentId);

        if (!incident) {
            throw new AppError("Incident not found", StatusCodes.NOT_FOUND, "INCIDENT_NOT_FOUND");
        }

        const rawUserId = req.user?.id || req.user?._id || req.userId;
        const me = (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId))
            ? await User.findById(rawUserId).select("_id activeRole email")
            : null;
        const currentUser = me || (req.user?.email
            ? await User.findOne({ email: req.user.email }).select("_id activeRole email")
            : null);

        if (!currentUser?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const currentUserId = currentUser._id.toString();
        const isCreator = incident.creatorId?.toString() === currentUserId;
        const isVictim = (incident.victims || []).some((id) => id.toString() === currentUserId);
        const isVolunteer = (incident.volunteers || []).some((id) => id.toString() === currentUserId);
        const isAdminParticipant = (incident.admins || []).some((id) => id.toString() === currentUserId);
        const isPlatformAdmin = currentUser.activeRole === "admin";
        const canViewClosed = isCreator || isVictim || isVolunteer || isAdminParticipant || isPlatformAdmin;
        const normalizedStatus = String(incident.status || "").trim().toLowerCase();
        const isClosed = normalizedStatus === "closed";

        if (isClosed && !canViewClosed) {
            throw new AppError("You are not allowed to view this incident", StatusCodes.FORBIDDEN, "INCIDENT_VIEW_FORBIDDEN");
        }

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Incident fetched successfully",
            data: {
                incident,
            },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getIncidentById };
