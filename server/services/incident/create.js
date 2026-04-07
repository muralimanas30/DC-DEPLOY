const { StatusCodes } = require("http-status-codes");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");
const { emitIncidentChanged } = require("../../socket");
const { notifyIncidentCreated } = require("../sms");
const { logger } = require("../../utils/logger");

const fireAndForget = (promise, label) => {
    promise.catch((error) => {
        logger.error('notify', `${label} failed`, error?.message || error);
    });
};

const normalizePointLocation = (rawLocation) => {
    if (!rawLocation || typeof rawLocation !== "object") {
        return null;
    }

    if (
        rawLocation.type === "Point"
        && Array.isArray(rawLocation.coordinates)
        && rawLocation.coordinates.length === 2
    ) {
        const first = Number(rawLocation.coordinates[0]);
        const second = Number(rawLocation.coordinates[1]);

        if (Number.isFinite(first) && Number.isFinite(second)) {
            let lng = first;
            let lat = second;

            // Heal common swapped payload format: [lat, lng].
            if (Math.abs(lng) <= 90 && Math.abs(lat) > 90) {
                lng = second;
                lat = first;
            }

            if (Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
                return {
                    type: "Point",
                    coordinates: [lng, lat],
                };
            }
        }
    }

    if (Number.isFinite(rawLocation.lng) && Number.isFinite(rawLocation.lat)) {
        return {
            type: "Point",
            coordinates: [Number(rawLocation.lng), Number(rawLocation.lat)],
        };
    }

    if (Number.isFinite(rawLocation.longitude) && Number.isFinite(rawLocation.latitude)) {
        return {
            type: "Point",
            coordinates: [Number(rawLocation.longitude), Number(rawLocation.latitude)],
        };
    }

    return null;
};

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

        const creatorLocation = normalizePointLocation(creator.currentLocation);
        const incidentLocation = normalizePointLocation(location) || creatorLocation;

        if (!incidentLocation) {
            throw new AppError(
                "A valid incident location is required",
                StatusCodes.BAD_REQUEST,
                "INVALID_INCIDENT_LOCATION"
            );
        }

        const incident = await Incident.create({
            title,
            description,
            category,
            severity,
            location: incidentLocation,
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

        emitIncidentChanged({
            type: "created",
            incident,
            actorId: creatorId?.toString?.() || creatorId,
        });

        fireAndForget(
            notifyIncidentCreated({ incidentId: incident._id }),
            "incident-created"
        );

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
