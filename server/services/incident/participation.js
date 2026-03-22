const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");

const roleToField = {
    victim: "victims",
    volunteer: "volunteers",
    admin: "admins",
};

const getCurrentUser = async (req) => {
    const rawUserId = req.user?.id || req.user?._id || req.userId;

    const byId = (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId))
        ? await User.findById(rawUserId).select("_id activeRole roles email assignedIncident")
        : null;

    if (byId) return byId;

    if (req.user?.email) {
        return User.findOne({ email: req.user.email }).select("_id activeRole roles email assignedIncident");
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

    if (incident.status === "closed") {
        throw new AppError("Incident is closed", StatusCodes.CONFLICT, "INCIDENT_CLOSED");
    }

    return incident;
};

const normalizeParticipantState = async (incident) => {
    const victims = (incident.victims || []).map((id) => id.toString());
    const volunteers = (incident.volunteers || []).map((id) => id.toString());
    const admins = (incident.admins || []).map((id) => id.toString());

    incident.victims = [...new Set(victims)];
    incident.volunteers = [...new Set(volunteers)];
    incident.admins = [...new Set(admins)];

    const activeParticipants = incident.victims.length + incident.volunteers.length + incident.admins.length;
    incident.status = activeParticipants > 0 ? "active" : "closed";
    await incident.save();

    return incident;
};

const joinIncident = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const me = await getCurrentUser(req);

        if (!me?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const incident = await loadIncident(incidentId);
        const meId = me._id.toString();
        const targetField = roleToField[me.activeRole] || "victims";

        incident.victims = (incident.victims || []).filter((id) => id.toString() !== meId);
        incident.volunteers = (incident.volunteers || []).filter((id) => id.toString() !== meId);
        incident.admins = (incident.admins || []).filter((id) => id.toString() !== meId);

        incident[targetField].push(me._id);
        await normalizeParticipantState(incident);

        await User.updateOne({ _id: me._id }, { $set: { assignedIncident: incident._id } });

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Joined incident successfully",
            data: { incident },
        });
    } catch (err) {
        next(err);
    }
};

const leaveIncident = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const me = await getCurrentUser(req);

        if (!me?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const incident = await loadIncident(incidentId);
        const meId = me._id.toString();

        incident.victims = (incident.victims || []).filter((id) => id.toString() !== meId);
        incident.volunteers = (incident.volunteers || []).filter((id) => id.toString() !== meId);
        incident.admins = (incident.admins || []).filter((id) => id.toString() !== meId);

        await normalizeParticipantState(incident);

        await User.updateOne(
            { _id: me._id, assignedIncident: incident._id },
            { $set: { assignedIncident: null } }
        );

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Left incident successfully",
            data: { incident },
        });
    } catch (err) {
        next(err);
    }
};

const assignUser = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const { userId } = req.body;

        const me = await getCurrentUser(req);
        if (!me?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError("Valid userId is required", StatusCodes.BAD_REQUEST, "INVALID_USER_ID");
        }

        const incident = await loadIncident(incidentId);

        const meId = me._id.toString();
        const isIncidentAdmin = (incident.admins || []).some((id) => id.toString() === meId);
        const isPlatformAdmin = me.activeRole === "admin";
        if (!isIncidentAdmin && !isPlatformAdmin) {
            throw new AppError("Only admins can assign users", StatusCodes.FORBIDDEN, "INCIDENT_ASSIGN_FORBIDDEN");
        }

        const targetUser = await User.findById(userId).select("_id activeRole roles assignedIncident");
        if (!targetUser) {
            throw new AppError("User not found", StatusCodes.NOT_FOUND, "USER_NOT_FOUND");
        }

        const targetId = targetUser._id.toString();
        const targetRole = targetUser.activeRole || "victim";
        const targetField = roleToField[targetRole] || "victims";

        incident.victims = (incident.victims || []).filter((id) => id.toString() !== targetId);
        incident.volunteers = (incident.volunteers || []).filter((id) => id.toString() !== targetId);
        incident.admins = (incident.admins || []).filter((id) => id.toString() !== targetId);

        incident[targetField].push(targetUser._id);
        await normalizeParticipantState(incident);

        await User.updateOne({ _id: targetUser._id }, { $set: { assignedIncident: incident._id } });

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "User assigned to incident successfully",
            data: { incident },
        });
    } catch (err) {
        next(err);
    }
};

const unassignUser = async (req, res, next) => {
    try {
        const { incidentId, userId } = req.params;

        const me = await getCurrentUser(req);
        if (!me?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError("Valid userId is required", StatusCodes.BAD_REQUEST, "INVALID_USER_ID");
        }

        const incident = await loadIncident(incidentId);
        const meId = me._id.toString();
        const isIncidentAdmin = (incident.admins || []).some((id) => id.toString() === meId);
        const isPlatformAdmin = me.activeRole === "admin";
        if (!isIncidentAdmin && !isPlatformAdmin) {
            throw new AppError("Only admins can unassign users", StatusCodes.FORBIDDEN, "INCIDENT_UNASSIGN_FORBIDDEN");
        }

        incident.victims = (incident.victims || []).filter((id) => id.toString() !== userId);
        incident.volunteers = (incident.volunteers || []).filter((id) => id.toString() !== userId);
        incident.admins = (incident.admins || []).filter((id) => id.toString() !== userId);

        await normalizeParticipantState(incident);

        await User.updateOne(
            { _id: userId, assignedIncident: incident._id },
            { $set: { assignedIncident: null } }
        );

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "User unassigned from incident successfully",
            data: { incident },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    joinIncident,
    leaveIncident,
    assignUser,
    unassignUser,
};
