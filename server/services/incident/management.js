const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");

const toStr = (value) => value?.toString();

const getCurrentUser = async (req) => {
    const rawUserId = req.user?.id || req.user?._id || req.userId;

    const byId = (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId))
        ? await User.findById(rawUserId).select("_id activeRole email")
        : null;

    if (byId) return byId;

    if (req.user?.email) {
        return User.findOne({ email: req.user.email }).select("_id activeRole email");
    }

    return null;
};

const loadIncident = async (incidentId) => {
    if (!mongoose.Types.ObjectId.isValid(incidentId)) {
        throw new AppError("Invalid incident id", StatusCodes.BAD_REQUEST, "INVALID_INCIDENT_ID");
    }

    const incident = await Incident.findById(incidentId);
    if (!incident) {
        throw new AppError("Incident not found", StatusCodes.NOT_FOUND, "INCIDENT_NOT_FOUND");
    }

    return incident;
};

const ensureIncidentVisible = (incident, userId, activeRole) => {
    const meId = toStr(userId);
    const isCreator = toStr(incident.creatorId) === meId;
    const isVictim = (incident.victims || []).some((id) => toStr(id) === meId);
    const isVolunteer = (incident.volunteers || []).some((id) => toStr(id) === meId);
    const isAdminParticipant = (incident.admins || []).some((id) => toStr(id) === meId);
    const isPlatformAdmin = activeRole === "admin";

    const normalizedStatus = String(incident.status || "").trim().toLowerCase();
    const isClosed = normalizedStatus === "closed";
    const canViewClosed = isCreator || isVictim || isVolunteer || isAdminParticipant || isPlatformAdmin;

    if (isClosed && !canViewClosed) {
        throw new AppError("You are not allowed to view this incident", StatusCodes.FORBIDDEN, "INCIDENT_VIEW_FORBIDDEN");
    }

    return {
        isPlatformAdmin,
        isAdminParticipant,
        isCreator,
        isVictim,
        isVolunteer,
    };
};

const toUserSummary = (user) => ({
    _id: user._id,
    name: user.name || "Unnamed user",
    email: user.email,
    activeRole: user.activeRole,
    roles: user.roles || [],
    skills: Array.isArray(user.skills) ? user.skills : [],
    assignedIncident: user.assignedIncident || null,
    isOnline: Boolean(user.isOnline),
    currentLocation: user.currentLocation || null,
});

const getIncidentParticipants = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const currentUser = await getCurrentUser(req);

        if (!currentUser?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const incident = await loadIncident(incidentId);
        const visibility = ensureIncidentVisible(incident, currentUser._id, currentUser.activeRole);

        const canViewParticipants = visibility.isPlatformAdmin
            || visibility.isCreator
            || visibility.isVictim
            || visibility.isVolunteer
            || visibility.isAdminParticipant;

        if (!canViewParticipants) {
            throw new AppError(
                "You can view members only for incidents you are part of",
                StatusCodes.FORBIDDEN,
                "INCIDENT_PARTICIPANTS_FORBIDDEN"
            );
        }

        const victims = (incident.victims || []).map((id) => toStr(id));
        const volunteers = (incident.volunteers || []).map((id) => toStr(id));
        const admins = (incident.admins || []).map((id) => toStr(id));

        const allParticipantIds = [...new Set([...victims, ...volunteers, ...admins])]
            .filter((id) => mongoose.Types.ObjectId.isValid(id));

        const users = await User.find({ _id: { $in: allParticipantIds } })
            .select("_id name email activeRole roles skills assignedIncident isOnline currentLocation")
            .lean();

        const byId = new Map(users.map((user) => [toStr(user._id), user]));

        const mapRoleList = (ids) => ids
            .map((id) => byId.get(id))
            .filter(Boolean)
            .map(toUserSummary);

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Incident participants fetched successfully",
            data: {
                incident,
                participants: {
                    victims: mapRoleList(victims),
                    volunteers: mapRoleList(volunteers),
                    admins: mapRoleList(admins),
                },
            },
        });
    } catch (err) {
        next(err);
    }
};

const getAvailableVolunteers = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const currentUser = await getCurrentUser(req);

        if (!currentUser?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const incident = await loadIncident(incidentId);
        if (incident.status === "closed") {
            throw new AppError("Incident is closed", StatusCodes.CONFLICT, "INCIDENT_CLOSED");
        }

        const { isPlatformAdmin, isAdminParticipant } = ensureIncidentVisible(
            incident,
            currentUser._id,
            currentUser.activeRole
        );

        if (!isPlatformAdmin && !isAdminParticipant) {
            throw new AppError("Only admins can view available volunteers", StatusCodes.FORBIDDEN, "INCIDENT_ASSIGN_FORBIDDEN");
        }

        const existingIds = [
            ...(incident.victims || []),
            ...(incident.volunteers || []),
            ...(incident.admins || []),
        ].map((id) => toStr(id));

        const volunteers = await User.find({
            activeRole: "volunteer",
            _id: { $nin: existingIds },
            assignedIncident: null,
        })
            .select("_id name email activeRole roles skills assignedIncident isOnline")
            .sort({ isOnline: -1, name: 1 })
            .lean();

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Available volunteers fetched successfully",
            data: {
                volunteers: volunteers.map(toUserSummary),
            },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getIncidentParticipants,
    getAvailableVolunteers,
};
