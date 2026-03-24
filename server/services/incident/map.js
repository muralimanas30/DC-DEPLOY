const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");

const toStr = (value) => value?.toString();

const hasValidCoordinates = (geo) => {
    const coordinates = geo?.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length !== 2) return false;

    const [lng, lat] = coordinates;
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;

    // Guard against default placeholder location.
    if (Math.abs(lng) < 0.000001 && Math.abs(lat) < 0.000001) return false;

    return true;
};

const mapIncident = (incident) => {
    const [lng, lat] = incident.location.coordinates;
    return {
        id: toStr(incident._id),
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        category: incident.category,
        status: incident.status,
        participants:
            (incident.victims || []).length
            + (incident.volunteers || []).length
            + (incident.admins || []).length,
        location: { lng, lat },
        createdAt: incident.createdAt,
    };
};

const mapParticipant = (user, currentUserId) => {
    const role = user.activeRole || "victim";
    const isSelf = toStr(user._id) === toStr(currentUserId);
    const hasLocation = hasValidCoordinates(user.currentLocation);
    const [lng, lat] = hasLocation ? user.currentLocation.coordinates : [null, null];
    const lastLocationAt = user?.lastSeen ? new Date(user.lastSeen).toISOString() : null;
    const sharingState = hasLocation
        ? (user?.isOnline ? "sharing" : "offline")
        : "not_sharing";

    return {
        id: toStr(user._id),
        name: user.name || user.email || "Responder",
        role,
        isSelf,
        isOnline: Boolean(user.isOnline),
        hasLocation,
        sharingState,
        lastLocationAt,
        location: hasLocation ? { lng, lat } : null,
    };
};

const getCurrentUser = async (req) => {
    const rawUserId = req.user?.id || req.user?._id || req.userId;

    const byId = (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId))
        ? await User.findById(rawUserId).select("_id name email activeRole assignedIncident currentLocation isOnline lastSeen")
        : null;

    if (byId) return byId;

    if (req.user?.email) {
        return User.findOne({ email: req.user.email })
            .select("_id name email activeRole assignedIncident currentLocation isOnline lastSeen");
    }

    return null;
};

const getIncidentMapFeed = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req);
        if (!currentUser?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const activeIncidents = await Incident.find({ status: "active" })
            .select("_id title description category severity status location victims volunteers admins createdAt")
            .sort({ createdAt: -1 })
            .limit(300)
            .lean();

        const incidentMarkers = activeIncidents
            .filter((incident) => hasValidCoordinates(incident.location))
            .map(mapIncident);

        let mode = "global";
        let assignedIncidentSummary = null;
        let incidentLocation = null;
        let selfLocation = null;
        let selfLocationAt = null;
        let participantLocations = [];
        let participants = [];

        const assignedIncidentId = currentUser.assignedIncident ? toStr(currentUser.assignedIncident) : null;
        if (assignedIncidentId && mongoose.Types.ObjectId.isValid(assignedIncidentId)) {
            const assignedIncident = await Incident.findOne({ _id: assignedIncidentId, status: "active" })
                .select("_id title description category severity status location victims volunteers admins createdAt")
                .lean();

            if (assignedIncident) {
                mode = "assigned";
                assignedIncidentSummary = mapIncident(assignedIncident);
                incidentLocation = assignedIncidentSummary.location;

                if (hasValidCoordinates(currentUser.currentLocation)) {
                    const [lng, lat] = currentUser.currentLocation.coordinates;
                    selfLocation = { lng, lat };
                    selfLocationAt = currentUser?.lastSeen ? new Date(currentUser.lastSeen).toISOString() : null;
                }

                const participantIds = [
                    ...(assignedIncident.victims || []),
                    ...(assignedIncident.volunteers || []),
                    ...(assignedIncident.admins || []),
                ];

                const users = await User.find({ _id: { $in: participantIds } })
                    .select("_id name email activeRole currentLocation isOnline lastSeen")
                    .lean();

                participants = users
                    .map((user) => mapParticipant(user, currentUser._id));

                participantLocations = participants
                    .filter((participant) => participant.hasLocation)
                    .map((participant) => ({
                        id: participant.id,
                        name: participant.name,
                        role: participant.role,
                        isSelf: participant.isSelf,
                        isOnline: participant.isOnline,
                        sharingState: participant.sharingState,
                        lastLocationAt: participant.lastLocationAt,
                        location: participant.location,
                    }));
            }
        }

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Incident map feed fetched successfully",
            data: {
                mode,
                incidents: incidentMarkers,
                assignedIncident: assignedIncidentSummary,
                tracked: {
                    incidentLocation,
                    selfLocation,
                    selfLocationAt,
                    participants: participantLocations,
                    allParticipants: participants,
                    meta: {
                        source: "map-feed",
                        generatedAt: new Date().toISOString(),
                    },
                },
            },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    getIncidentMapFeed,
};
