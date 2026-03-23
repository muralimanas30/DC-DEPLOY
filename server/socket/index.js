const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const User = require("../models/User");

const SOCKET_EVENTS = {
    INCIDENT_CHANGED: "incident:changed",
    INCIDENT_CLOSED: "incident:closed",
    INCIDENT_WATCH: "incident:watch",
    INCIDENT_UNWATCH: "incident:unwatch",
    INCIDENT_ALERT: "incidentAlert",
    SEND_ALERT: "sendAlert",
};

const ROOMS = {
    INCIDENTS: "incidents",
    incident: (incidentId) => `incident:${incidentId}`,
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

const resolveSocketUser = async (decoded) => {
    const userId = decoded?.id || decoded?._id || null;

    if (!userId) {
        return null;
    }

    const user = await User.findById(userId)
        .select("_id email activeRole assignedIncident")
        .lean();

    if (!user) {
        return null;
    }

    return {
        id: user._id.toString(),
        email: user.email,
        activeRole: user.activeRole || decoded?.activeRole || decoded?.role || "victim",
        assignedIncident: user.assignedIncident ? user.assignedIncident.toString() : null,
    };
};

const buildAlertMessage = (alertType, senderName) => {
    const prefix = senderName || "Team member";
    if (alertType === "comeToMe") return `${prefix}: Come to me`;
    if (alertType === "stayTogether") return `${prefix}: Stay together`;
    return `${prefix}: Alert`;
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

        socket.on(SOCKET_EVENTS.INCIDENT_WATCH, (payload = {}) => {
            const incidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!incidentId) return;
            socket.join(ROOMS.incident(incidentId));
        });

        socket.on(SOCKET_EVENTS.INCIDENT_UNWATCH, (payload = {}) => {
            const incidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!incidentId) return;
            socket.leave(ROOMS.incident(incidentId));
        });

        // Backward-compatible support for existing alert widget.
        socket.on(SOCKET_EVENTS.SEND_ALERT, (payload = {}) => {
            const incidentId = payload?.incidentId ? String(payload.incidentId) : null;
            if (!incidentId) return;

            ioInstance.to(ROOMS.incident(incidentId)).emit(SOCKET_EVENTS.INCIDENT_ALERT, {
                userId: user.id,
                incidentId,
                role: user.activeRole,
                name: user.email,
                message: buildAlertMessage(payload?.alertType, user.email),
                timestamp: new Date().toISOString(),
            });
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