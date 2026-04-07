const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const IncidentMessage = require("../../models/IncidentMessage");
const User = require("../../models/User");
const { sendSuccess } = require("../../utils/response");
const { getIO, ROOMS, SOCKET_EVENTS } = require("../../socket");
const { notifyQuickAlertParticipants } = require("../sms");
const { logger } = require("../../utils/logger");

const fireAndForget = (promise, label) => {
    promise.catch((error) => {
        logger.error('notify', `${label} failed`, error?.message || error);
    });
};

const ALERT_TEMPLATES = {
    comeToMe: { title: "Come To Me", message: "Move to my location.", severity: "medium" },
    stayTogether: { title: "Stay Together", message: "Stay in formation and avoid splitting up.", severity: "medium" },
    needBackup: { title: "Need Backup", message: "Additional responders needed at this location.", severity: "high" },
    routeBlocked: { title: "Route Blocked", message: "Primary route is blocked. Use alternate path.", severity: "high" },
    needHelp: { title: "Need Help", message: "I need immediate assistance.", severity: "high" },
    medicalEmergency: { title: "Medical Emergency", message: "Urgent medical support required.", severity: "critical" },
    trapped: { title: "Trapped", message: "I am trapped and cannot move safely.", severity: "critical" },
    evacuate: { title: "Evacuate", message: "Evacuate this zone immediately.", severity: "critical" },
    escalate: { title: "Escalated", message: "Incident severity has increased. Prioritize response.", severity: "critical" },
    standDown: { title: "Stand Down", message: "Stand down and hold position.", severity: "low" },
};

const ALLOWED_ALERTS_BY_ROLE = {
    victim: new Set(["needHelp", "medicalEmergency", "trapped", "comeToMe"]),
    volunteer: new Set(["comeToMe", "stayTogether", "needBackup", "routeBlocked"]),
    admin: new Set([
        "comeToMe",
        "stayTogether",
        "needBackup",
        "routeBlocked",
        "needHelp",
        "medicalEmergency",
        "trapped",
        "evacuate",
        "escalate",
        "standDown",
    ]),
};

const toStr = (value) => value?.toString();

const getCurrentUser = async (req) => {
    const rawUserId = req.user?.id || req.user?._id || req.userId;

    const byId = (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId))
        ? await User.findById(rawUserId).select("_id name email activeRole")
        : null;

    if (byId) return byId;

    if (req.user?.email) {
        return User.findOne({ email: req.user.email }).select("_id name email activeRole");
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

const getVisibility = (incident, currentUser) => {
    const userId = toStr(currentUser._id);
    const isCreator = toStr(incident.creatorId) === userId;
    const isVictim = (incident.victims || []).some((id) => toStr(id) === userId);
    const isVolunteer = (incident.volunteers || []).some((id) => toStr(id) === userId);
    const isAdminParticipant = (incident.admins || []).some((id) => toStr(id) === userId);
    const isPlatformAdmin = currentUser.activeRole === "admin";

    return {
        isCreator,
        isVictim,
        isVolunteer,
        isAdminParticipant,
        isPlatformAdmin,
        isParticipant: isCreator || isVictim || isVolunteer || isAdminParticipant,
    };
};

const mapMessage = (message) => ({
    id: toStr(message._id),
    incidentId: toStr(message.incidentId),
    senderId: toStr(message.senderId),
    senderName: message.senderName,
    senderRole: message.senderRole,
    type: message.type,
    body: message.body,
    alertType: message.alertType || null,
    alertTitle: message.alertTitle || null,
    severity: message.severity || "medium",
    createdAt: message.createdAt,
    updatedAt: message.updatedAt,
});

const getAlertTemplate = (alertType) => {
    return ALERT_TEMPLATES[alertType] || null;
};

const isAlertTypeAllowed = (role, alertType) => {
    const allowed = ALLOWED_ALERTS_BY_ROLE[role] || ALLOWED_ALERTS_BY_ROLE.victim;
    return allowed.has(alertType);
};

const listIncidentMessages = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const currentUser = await getCurrentUser(req);

        if (!currentUser?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const incident = await loadIncident(incidentId);
        const visibility = getVisibility(incident, currentUser);

        if (!visibility.isParticipant && !visibility.isPlatformAdmin) {
            throw new AppError("You are not allowed to view chat for this incident", StatusCodes.FORBIDDEN, "INCIDENT_CHAT_FORBIDDEN");
        }

        if (incident.status !== "active") {
            throw new AppError("Incident is closed; chat is unavailable", StatusCodes.CONFLICT, "INCIDENT_CLOSED");
        }

        const page = Math.max(1, Number(req.query?.page || 1));
        const limit = Math.min(100, Math.max(1, Number(req.query?.limit || 30)));
        const skip = (page - 1) * limit;

        const [messages, total] = await Promise.all([
            IncidentMessage.find({ incidentId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            IncidentMessage.countDocuments({ incidentId }),
        ]);

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Incident chat messages fetched successfully",
            data: {
                messages: messages.map(mapMessage),
                page,
                limit,
                total,
                hasMore: skip + messages.length < total,
            },
        });
    } catch (err) {
        next(err);
    }
};

const sendIncidentMessage = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const currentUser = await getCurrentUser(req);

        if (!currentUser?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const incident = await loadIncident(incidentId);
        const visibility = getVisibility(incident, currentUser);

        if (!visibility.isParticipant && !visibility.isPlatformAdmin) {
            throw new AppError("Only incident participants can send messages", StatusCodes.FORBIDDEN, "INCIDENT_CHAT_SEND_FORBIDDEN");
        }

        if (incident.status !== "active") {
            throw new AppError("Incident is closed; chat is read-only", StatusCodes.CONFLICT, "INCIDENT_CLOSED");
        }

        const body = String(req.body?.body || "").trim();
        if (!body) {
            throw new AppError("Message body is required", StatusCodes.BAD_REQUEST, "MESSAGE_BODY_REQUIRED");
        }

        if (body.length > 1200) {
            throw new AppError("Message body is too long", StatusCodes.BAD_REQUEST, "MESSAGE_BODY_TOO_LONG");
        }

        const message = await IncidentMessage.create({
            incidentId,
            senderId: currentUser._id,
            senderName: currentUser.name || currentUser.email || "Responder",
            senderRole: currentUser.activeRole || "victim",
            type: "text",
            body,
            severity: "low",
        });

        const mapped = mapMessage(message.toObject());
        const io = getIO();
        if (io) {
            io.to(ROOMS.incident(String(incidentId))).emit(SOCKET_EVENTS.INCIDENT_CHAT_MESSAGE, mapped);
        }

        return sendSuccess(res, {
            statusCode: StatusCodes.CREATED,
            msg: "Message sent successfully",
            data: { message: mapped },
        });
    } catch (err) {
        next(err);
    }
};

const sendIncidentAlert = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const currentUser = await getCurrentUser(req);

        if (!currentUser?._id) {
            throw new AppError("Unauthorized", StatusCodes.UNAUTHORIZED, "UNAUTHORIZED");
        }

        const incident = await loadIncident(incidentId);
        const visibility = getVisibility(incident, currentUser);

        if (!visibility.isParticipant && !visibility.isPlatformAdmin) {
            throw new AppError("Only incident participants can send alerts", StatusCodes.FORBIDDEN, "INCIDENT_ALERT_FORBIDDEN");
        }

        if (incident.status !== "active") {
            throw new AppError("Incident is closed; alerts are disabled", StatusCodes.CONFLICT, "INCIDENT_CLOSED");
        }

        const alertType = String(req.body?.alertType || "").trim();
        if (!alertType) {
            throw new AppError("Alert type is required", StatusCodes.BAD_REQUEST, "INVALID_ALERT_TYPE");
        }

        if (!isAlertTypeAllowed(currentUser.activeRole, alertType)) {
            throw new AppError("This alert type is not allowed for your role", StatusCodes.FORBIDDEN, "ALERT_TYPE_NOT_ALLOWED");
        }

        const template = getAlertTemplate(alertType);
        if (!template) {
            throw new AppError("Unknown alert type", StatusCodes.BAD_REQUEST, "INVALID_ALERT_TYPE");
        }

        const senderName = currentUser.name || currentUser.email || "Responder";

        const message = await IncidentMessage.create({
            incidentId,
            senderId: currentUser._id,
            senderName,
            senderRole: currentUser.activeRole || "victim",
            type: "alert",
            body: template.message,
            alertType,
            alertTitle: template.title,
            severity: template.severity,
        });

        const mapped = mapMessage(message.toObject());
        const io = getIO();

        if (io) {
            io.to(ROOMS.incident(String(incidentId))).emit(SOCKET_EVENTS.INCIDENT_ALERT, {
                id: `alert:${incidentId}:${toStr(currentUser._id)}:${Date.now()}`,
                incidentId: String(incidentId),
                alertType,
                title: template.title,
                message: template.message,
                severity: template.severity,
                senderId: toStr(currentUser._id),
                senderRole: currentUser.activeRole || "victim",
                senderName,
                timestamp: message.createdAt,
            });

            io.to(ROOMS.incident(String(incidentId))).emit(SOCKET_EVENTS.INCIDENT_CHAT_MESSAGE, mapped);
        }

        fireAndForget(
            notifyQuickAlertParticipants({
                incidentId,
                alertTitle: template.title,
                alertMessage: template.message,
                severity: template.severity,
            }),
            "incident-quick-alert"
        );

        return sendSuccess(res, {
            statusCode: StatusCodes.CREATED,
            msg: "Alert sent successfully",
            data: { message: mapped },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = {
    listIncidentMessages,
    sendIncidentMessage,
    sendIncidentAlert,
};
