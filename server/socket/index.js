const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const User = require("../models/User");
const Incident = require("../models/Incident");
const IncidentMessage = require("../models/IncidentMessage");

const SOCKET_EVENTS = {
    INCIDENT_CHANGED: "incident:changed",
    INCIDENT_CLOSED: "incident:closed",
    INCIDENT_WATCH: "incident:watch",
    INCIDENT_UNWATCH: "incident:unwatch",
    INCIDENT_ALERT: "incidentAlert",
    INCIDENT_ALERT_ERROR: "incidentAlert:error",
    INCIDENT_CHAT_MESSAGE: "incident:chat-message",
    SEND_ALERT: "sendAlert",
};

const ROOMS = {
    INCIDENTS: "incidents",
    incident: (incidentId) => `incident:${incidentId}`,
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

let ioInstance = null;

const parseToken = (value) => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase().startsWith("bearer ")) {
        return trimmed.slice(7).trim();
    }
    return trimmed;
};

const sanitizeIncident = (incident) => {
    if (!incident) return null;
    if (typeof incident.toObject === "function") {
        return incident.toObject();
    }
    return incident;
};

const toId = (value) => {
    if (!value) return null;
    return typeof value === "string" ? value : value.toString();
};

const includesUserId = (list, userId) => {
    if (!Array.isArray(list) || !userId) return false;
    return list.some((item) => toId(item) === userId);
};

const canAccessIncidentRoom = (incident, user) => {
    if (!incident || !user?.id) return false;
    if (user.activeRole === "admin") return true;

    const userId = user.id;
    const isCreator = toId(incident.creatorId) === userId;
    const isParticipant =
        includesUserId(incident.victims, userId)
        || includesUserId(incident.volunteers, userId)
        || includesUserId(incident.admins, userId);

    return isCreator || isParticipant;
};

const isAlertTypeAllowed = (role, alertType) => {
    const allowed = ALLOWED_ALERTS_BY_ROLE[role] || ALLOWED_ALERTS_BY_ROLE.victim;
    return allowed.has(alertType);
};

const getAlertTemplate = (alertType) => {
    return ALERT_TEMPLATES[alertType] || { title: "Alert", message: "Attention required.", severity: "medium" };
};

const resolveSocketUser = async (decoded) => {
    const userId = decoded?.id || decoded?._id || null;

    if (!userId) {
        return null;
    }

    const user = await User.findById(userId)
        .select("_id name email activeRole assignedIncident")
        .lean();

    if (!user) {
        return null;
    }

    return {
        id: user._id.toString(),
        name: user.name || null,
        email: user.email,
        activeRole: user.activeRole || decoded?.activeRole || decoded?.role || "victim",
        assignedIncident: user.assignedIncident ? user.assignedIncident.toString() : null,
    };
};

const initSocket = (httpServer) => {
    if (ioInstance) {
        return ioInstance;
    }

    ioInstance = new Server(httpServer, {
        cors: {
            origin: true,
            credentials: true,
        },
    });

    ioInstance.use(async (socket, next) => {
        try {
            const token = parseToken(
                socket.handshake?.auth?.token || socket.handshake?.headers?.authorization
            );

            if (!token) {
                return next(new Error("Unauthorized"));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await resolveSocketUser(decoded);

            if (!user?.id) {
                return next(new Error("Unauthorized"));
            }

            socket.user = user;
            return next();
        } catch {
            return next(new Error("Unauthorized"));
        }
    });

    ioInstance.on("connection", (socket) => {
        const user = socket.user;
        if (!user?.id) {
            socket.disconnect(true);
            return;
        }

        socket.join(ROOMS.INCIDENTS);

        socket.on(SOCKET_EVENTS.INCIDENT_WATCH, async (payload = {}) => {
            const incidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!incidentId) return;

            const incident = await Incident.findById(incidentId)
                .select("creatorId victims volunteers admins")
                .lean();

            if (!canAccessIncidentRoom(incident, user)) {
                return;
            }

            socket.join(ROOMS.incident(incidentId));
        });

        socket.on(SOCKET_EVENTS.INCIDENT_UNWATCH, (payload = {}) => {
            const incidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!incidentId) return;
            socket.leave(ROOMS.incident(incidentId));
        });

        socket.on(SOCKET_EVENTS.SEND_ALERT, async (payload = {}) => {
            const incidentId = payload?.incidentId ? String(payload.incidentId) : null;
            const alertType = typeof payload?.alertType === "string" ? payload.alertType.trim() : "";

            if (!incidentId) {
                socket.emit(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, {
                    incidentId: null,
                    code: "INVALID_INCIDENT_ID",
                    message: "Incident id is required to send alerts.",
                });
                return;
            }

            if (!alertType) {
                socket.emit(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, {
                    incidentId,
                    code: "INVALID_ALERT_TYPE",
                    message: "Alert type is required.",
                });
                return;
            }

            const incident = await Incident.findById(incidentId)
                .select("status creatorId victims volunteers admins")
                .lean();

            if (!incident) {
                socket.emit(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, {
                    incidentId,
                    code: "INCIDENT_NOT_FOUND",
                    message: "Incident not found.",
                });
                return;
            }

            if (incident.status !== "active") {
                socket.emit(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, {
                    incidentId,
                    code: "INCIDENT_CLOSED",
                    message: "Alerts can only be sent on active incidents.",
                });
                return;
            }

            if (!canAccessIncidentRoom(incident, user)) {
                socket.emit(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, {
                    incidentId,
                    code: "NOT_INCIDENT_PARTICIPANT",
                    message: "Only incident participants can send alerts.",
                });
                return;
            }

            if (!isAlertTypeAllowed(user.activeRole, alertType)) {
                socket.emit(SOCKET_EVENTS.INCIDENT_ALERT_ERROR, {
                    incidentId,
                    code: "ALERT_TYPE_NOT_ALLOWED",
                    message: "This alert type is not allowed for your role.",
                });
                return;
            }

            const template = getAlertTemplate(alertType);
            const senderName = user.name || user.email || "Responder";
            const timestamp = new Date().toISOString();
            const alertId = `alert:${incidentId}:${user.id}:${Date.now()}`;

            const alertMessageDoc = await IncidentMessage.create({
                incidentId,
                senderId: user.id,
                senderName,
                senderRole: user.activeRole,
                type: "alert",
                body: template.message,
                alertType,
                alertTitle: template.title,
                severity: template.severity,
            });

            const mappedChatMessage = {
                id: alertMessageDoc._id.toString(),
                incidentId: incidentId.toString(),
                senderId: user.id,
                senderName,
                senderRole: user.activeRole,
                type: "alert",
                body: template.message,
                alertType,
                alertTitle: template.title,
                severity: template.severity,
                createdAt: alertMessageDoc.createdAt,
                updatedAt: alertMessageDoc.updatedAt,
            };

            ioInstance.to(ROOMS.incident(incidentId)).emit(SOCKET_EVENTS.INCIDENT_ALERT, {
                id: alertId,
                incidentId,
                alertType,
                title: template.title,
                message: template.message,
                severity: template.severity,
                senderId: user.id,
                senderRole: user.activeRole,
                senderName,
                timestamp,
            });

            ioInstance.to(ROOMS.incident(incidentId)).emit(SOCKET_EVENTS.INCIDENT_CHAT_MESSAGE, mappedChatMessage);
        });
    });

    return ioInstance;
};

const getIO = () => ioInstance;

const emitIncidentChanged = ({ type, incident, incidentId, actorId, meta = {} }) => {
    if (!ioInstance) return;

    const normalizedIncident = sanitizeIncident(incident);
    const normalizedIncidentId = incidentId
        || normalizedIncident?._id?.toString?.()
        || normalizedIncident?._id
        || null;

    const payload = {
        type: type || "updated",
        incidentId: normalizedIncidentId,
        incident: normalizedIncident || null,
        actorId: actorId || null,
        ...meta,
        timestamp: new Date().toISOString(),
    };

    ioInstance.to(ROOMS.INCIDENTS).emit(SOCKET_EVENTS.INCIDENT_CHANGED, payload);

    if (normalizedIncident?.status === "closed" && normalizedIncidentId) {
        ioInstance.to(ROOMS.INCIDENTS).emit(SOCKET_EVENTS.INCIDENT_CLOSED, payload);
    }
};

module.exports = {
    SOCKET_EVENTS,
    ROOMS,
    initSocket,
    getIO,
    emitIncidentChanged,
};
