const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");
const { emitIncidentChanged } = require("../../socket");
const { notifyIncidentResolved } = require("../telegram");

const fireAndForget = (promise, label) => {
    promise.catch((error) => {
        console.error(`[TELEGRAM] ${label} notification failed:`, error?.message || error);
    });
};

const toObjectIdString = (value) => value?.toString();
const removeUserFromList = (list = [], userId) => list.filter((id) => toObjectIdString(id) !== userId);

const resolveIncident = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const rawUserId = req.user?.id || req.user?._id || req.userId;
        const forceCloseRequested = Boolean(req.forceCloseRequested)
            || String(req.query?.force || "").toLowerCase() === "true";

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
        const isAssignedVictim = incident.victims?.some((id) => id.toString() === currentUserId);
        const isAssignedVolunteer = incident.volunteers?.some((id) => id.toString() === currentUserId);
        const isAssignedAdmin = incident.admins?.some((id) => id.toString() === currentUserId);
        const isPlatformAdmin = currentUser?.activeRole === "admin";

        if (forceCloseRequested && !isPlatformAdmin) {
            throw new AppError("Only admins can force close incidents", StatusCodes.FORBIDDEN, "INCIDENT_FORCE_CLOSE_FORBIDDEN");
        }

        if (!forceCloseRequested && !isCreator && !isAssignedVictim && !isAssignedVolunteer && !isAssignedAdmin) {
            throw new AppError("You are not allowed to resolve this incident", StatusCodes.FORBIDDEN, "INCIDENT_RESOLVE_FORBIDDEN");
        }

        // Platform admin can force-close when explicitly requested.
        if (isPlatformAdmin && forceCloseRequested) {
            const participantIds = [
                ...(incident.victims || []),
                ...(incident.volunteers || []),
                ...(incident.admins || []),
            ].map((id) => id.toString());

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

            emitIncidentChanged({
                type: "force-closed",
                incident,
                actorId: currentUserId,
                meta: {
                    autoClosedBecauseNoVictims: false,
                },
            });

            return sendSuccess(res, {
                statusCode: StatusCodes.OK,
                msg: "Incident closed by admin",
                data: {
                    incident,
                    autoClosedBecauseNoVictims: false,
                },
            });
        }

        // Step 1: remove the acting user from participant lists immediately in DB.
        await Incident.updateOne(
            { _id: incident._id },
            {
                $pull: {
                    victims: currentUser._id,
                    volunteers: currentUser._id,
                    admins: currentUser._id,
                },
            }
        );

        const updatedIncident = await Incident.findById(incident._id);
        if (!updatedIncident) {
            throw new AppError("Incident not found", StatusCodes.NOT_FOUND, "INCIDENT_NOT_FOUND");
        }

        const nextVictims = removeUserFromList(updatedIncident.victims || [], currentUserId);
        const nextVolunteers = removeUserFromList(updatedIncident.volunteers || [], currentUserId);
        const nextAdmins = removeUserFromList(updatedIncident.admins || [], currentUserId);

        // Normalize arrays as string-removed lists to avoid stale mixed types.
        updatedIncident.victims = nextVictims;
        updatedIncident.volunteers = nextVolunteers;
        updatedIncident.admins = nextAdmins;

        const shouldCloseIncident = nextVictims.length === 0;

        if (shouldCloseIncident) {
            const participantIdsToClear = [...new Set([
                ...nextVictims,
                ...nextVolunteers,
                ...nextAdmins,
                currentUserId,
            ])].filter((id) => mongoose.Types.ObjectId.isValid(id));

            updatedIncident.victims = [];
            updatedIncident.volunteers = [];
            updatedIncident.admins = [];
            updatedIncident.status = "closed";
            await updatedIncident.save();

            if (participantIdsToClear.length) {
                await User.updateMany(
                    { _id: { $in: participantIdsToClear } },
                    { $set: { assignedIncident: null } }
                );
            }

            emitIncidentChanged({
                type: "closed",
                incident: updatedIncident,
                actorId: currentUserId,
                meta: {
                    autoClosedBecauseNoVictims: true,
                },
            });

            return sendSuccess(res, {
                statusCode: StatusCodes.OK,
                msg: "Incident closed successfully",
                data: {
                    incident: updatedIncident,
                    autoClosedBecauseNoVictims: true,
                },
            });
        }

        updatedIncident.status = "active";
        await updatedIncident.save();

        // Step 2: current user's assignment should be cleared when they resolve themselves out.
        await User.updateOne({ _id: currentUser._id }, { $set: { assignedIncident: null } });

        emitIncidentChanged({
            type: "resolved",
            incident: updatedIncident,
            actorId: currentUserId,
            meta: {
                autoClosedBecauseNoVictims: false,
            },
        });

        fireAndForget(
            notifyIncidentResolved({ incidentId: updatedIncident._id }),
            `incident-resolved:${updatedIncident._id}`
        );

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: updatedIncident.status === "closed" ? "Incident closed successfully" : "Your participation was resolved",
            data: {
                incident: updatedIncident,
                autoClosedBecauseNoVictims: false,
            },
        });
    } catch (err) {
        next(err);
    }
};

const forceCloseIncident = async (req, res, next) => {
    req.forceCloseRequested = true;
    return resolveIncident(req, res, next);
};

module.exports = {
    resolveIncident,
    forceCloseIncident,
};
