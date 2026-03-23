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

const ensureNoConflictingActiveAssignment = async (
    userDoc,
    currentIncidentId,
    conflictMessage,
    conflictCode
) => {
    const assignedId = userDoc?.assignedIncident ? userDoc.assignedIncident.toString() : null;
    const currentId = currentIncidentId?.toString();

    if (!assignedId || assignedId === currentId) {
        return;
    }

    if (!mongoose.Types.ObjectId.isValid(assignedId)) {
        await User.updateOne({ _id: userDoc._id }, { $set: { assignedIncident: null } });
        return;
    }

    const assignedIncident = await Incident.findById(assignedId).select("_id status");

    if (!assignedIncident || assignedIncident.status === "closed") {
        await User.updateOne(
            { _id: userDoc._id, assignedIncident: assignedId },
            { $set: { assignedIncident: null } }
        );
        return;
    }

    throw new AppError(conflictMessage, StatusCodes.CONFLICT, conflictCode);
};

const normalizeParticipantState = async (incident) => {
    const victims = (incident.victims || []).map((id) => id.toString());
    const volunteers = (incident.volunteers || []).map((id) => id.toString());
    const admins = (incident.admins || []).map((id) => id.toString());

    const uniqueVictims = [...new Set(victims)];
    const uniqueVolunteers = [...new Set(volunteers)];
    const uniqueAdmins = [...new Set(admins)];

    if (uniqueVictims.length === 0) {
        const participantIds = [...new Set([...uniqueVictims, ...uniqueVolunteers, ...uniqueAdmins])]
            .filter((id) => mongoose.Types.ObjectId.isValid(id));

        incident.victims = [];
        incident.volunteers = [];
        incident.admins = [];
        incident.status = "closed";
        await incident.save();

        if (participantIds.length) {
            await User.updateMany(
                { _id: { $in: participantIds } },
                { $set: { assignedIncident: null } }
            );
        }

        return {
            incident,
            autoClosedBecauseNoVictims: true,
        };
    }

    incident.victims = uniqueVictims;
    incident.volunteers = uniqueVolunteers;
    incident.admins = uniqueAdmins;
    incident.status = "active";
    await incident.save();

    return {
        incident,
        autoClosedBecauseNoVictims: false,
    };
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

        await ensureNoConflictingActiveAssignment(
            me,
            incident._id,
            "You are already assigned to another active incident. Resolve/leave it before joining a new one",
            "ALREADY_ASSIGNED_TO_OTHER_INCIDENT"
        );

        const targetField = roleToField[me.activeRole] || "victims";

        incident.victims = (incident.victims || []).filter((id) => id.toString() !== meId);
        incident.volunteers = (incident.volunteers || []).filter((id) => id.toString() !== meId);
        incident.admins = (incident.admins || []).filter((id) => id.toString() !== meId);

        incident[targetField].push(me._id);
        const { incident: normalizedIncident, autoClosedBecauseNoVictims } = await normalizeParticipantState(incident);

        if (!autoClosedBecauseNoVictims) {
            await User.updateOne({ _id: me._id }, { $set: { assignedIncident: incident._id } });
        }

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Joined incident successfully",
            data: {
                incident: normalizedIncident,
                autoClosedBecauseNoVictims,
            },
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

        const { incident: normalizedIncident, autoClosedBecauseNoVictims } = await normalizeParticipantState(incident);

        await User.updateOne(
            { _id: me._id, assignedIncident: incident._id },
            { $set: { assignedIncident: null } }
        );

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Left incident successfully",
            data: {
                incident: normalizedIncident,
                autoClosedBecauseNoVictims,
            },
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

        await ensureNoConflictingActiveAssignment(
            targetUser,
            incident._id,
            "User is already assigned to another active incident",
            "TARGET_ALREADY_ASSIGNED_TO_OTHER_INCIDENT"
        );

        const targetId = targetUser._id.toString();
        const targetRole = targetUser.activeRole || "victim";
        const targetField = roleToField[targetRole] || "victims";

        incident.victims = (incident.victims || []).filter((id) => id.toString() !== targetId);
        incident.volunteers = (incident.volunteers || []).filter((id) => id.toString() !== targetId);
        incident.admins = (incident.admins || []).filter((id) => id.toString() !== targetId);

        incident[targetField].push(targetUser._id);
        const { incident: normalizedIncident, autoClosedBecauseNoVictims } = await normalizeParticipantState(incident);

        if (!autoClosedBecauseNoVictims) {
            await User.updateOne({ _id: targetUser._id }, { $set: { assignedIncident: incident._id } });
        }

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "User assigned to incident successfully",
            data: {
                incident: normalizedIncident,
                autoClosedBecauseNoVictims,
            },
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

        const { incident: normalizedIncident, autoClosedBecauseNoVictims } = await normalizeParticipantState(incident);

        await User.updateOne(
            { _id: userId, assignedIncident: incident._id },
            { $set: { assignedIncident: null } }
        );

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "User unassigned from incident successfully",
            data: {
                incident: normalizedIncident,
                autoClosedBecauseNoVictims,
            },
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
