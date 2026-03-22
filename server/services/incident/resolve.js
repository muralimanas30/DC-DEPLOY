const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");

const toObjectIdString = (value) => value?.toString();
const removeUserFromList = (list = [], userId) => list.filter((id) => toObjectIdString(id) !== userId);

const resolveIncident = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const rawUserId = req.user?.id || req.user?._id || req.userId;

        if (!mongoose.Types.ObjectId.isValid(incidentId)) {
            throw new AppError("Invalid incident id", StatusCodes.BAD_REQUEST, "INVALID_INCIDENT_ID");
        }

        const incident = await Incident.findById(incidentId);
        if (!incident) {
            throw new AppError("Incident not found", StatusCodes.NOT_FOUND, "INCIDENT_NOT_FOUND");
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

        if (!isCreator && !isAssignedVictim && !isAssignedVolunteer && !isAssignedAdmin && !isPlatformAdmin) {
            throw new AppError("You are not allowed to resolve this incident", StatusCodes.FORBIDDEN, "INCIDENT_RESOLVE_FORBIDDEN");
        }

        // Platform admin can force-close at any time.
        if (isPlatformAdmin) {
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

            return sendSuccess(res, {
                statusCode: StatusCodes.OK,
                msg: "Incident closed by admin",
                data: {
                    incident,
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

        const activeParticipants = nextVictims.length + nextVolunteers.length + nextAdmins.length;
        updatedIncident.status = activeParticipants > 0 ? "active" : "closed";
        await updatedIncident.save();

        // Step 2: current user's assignment should be cleared when they resolve themselves out.
        await User.updateOne({ _id: currentUser._id }, { $set: { assignedIncident: null } });

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: updatedIncident.status === "closed" ? "Incident closed successfully" : "Your participation was resolved",
            data: {
                incident: updatedIncident,
            },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { resolveIncident };
