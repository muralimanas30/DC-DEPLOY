const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');
const { AppError } = require('../errorHandler/errorHandler');
const Incident = require('../models/Incident');
const User = require('../models/User');
const { sendSuccess } = require('../utils/response');
const {
    normalizePhone,
    createInboundReportRecord,
    processIncomingSmsWebhook,
    sendIncidentUpdateToVictims,
    listIncidentSmsLogs,
} = require('../services/sms');

const toObjectIdString = (value) => value?.toString?.() || null;

const getCurrentUser = async (req) => {
    const rawUserId = req.user?.id || req.user?._id || req.userId;

    const byId = (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId))
        ? await User.findById(rawUserId).select('_id name email phone activeRole')
        : null;

    if (byId) return byId;

    if (req.user?.email) {
        return User.findOne({ email: req.user.email }).select('_id name email phone activeRole');
    }

    return null;
};

const ensureAdminCanNotify = async (incident, user) => {
    const meId = toObjectIdString(user?._id);
    const isPlatformAdmin = user?.activeRole === 'admin';
    const isIncidentAdmin = (incident.admins || []).some((id) => toObjectIdString(id) === meId);

    if (!isPlatformAdmin && !isIncidentAdmin) {
        throw new AppError('Only admins can send incident SMS notifications', StatusCodes.FORBIDDEN, 'SMS_NOTIFY_FORBIDDEN');
    }
};

const ensureIncidentVisible = async (incident, user) => {
    const meId = toObjectIdString(user?._id);
    const isPlatformAdmin = user?.activeRole === 'admin';
    const isCreator = toObjectIdString(incident.creatorId) === meId;

    const isParticipant = [
        ...(incident.victims || []),
        ...(incident.volunteers || []),
        ...(incident.admins || []),
    ].some((id) => toObjectIdString(id) === meId);

    if (!isPlatformAdmin && !isCreator && !isParticipant) {
        throw new AppError('You are not allowed to view SMS logs for this incident', StatusCodes.FORBIDDEN, 'SMS_LOGS_FORBIDDEN');
    }
};

const createReportSms = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req);
        if (!currentUser?._id) {
            throw new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }

        const {
            incidentId,
            type = 'incident',
            message,
            phone,
            location,
            lat,
            lng,
        } = req.body || {};

        if (!message || !String(message).trim()) {
            throw new AppError('message is required', StatusCodes.BAD_REQUEST, 'SMS_REPORT_MESSAGE_REQUIRED');
        }

        if (incidentId && !mongoose.Types.ObjectId.isValid(incidentId)) {
            throw new AppError('Invalid incidentId', StatusCodes.BAD_REQUEST, 'INVALID_INCIDENT_ID');
        }

        const resolvedPhone = normalizePhone(phone || currentUser.phone);
        if (!resolvedPhone) {
            throw new AppError('A valid phone number is required for SMS report', StatusCodes.BAD_REQUEST, 'SMS_REPORT_PHONE_REQUIRED');
        }

        const locationPayload = (location && typeof location === 'object')
            ? location
            : { lat, lng };

        const locationPart = Number.isFinite(Number(locationPayload?.lat))
            && Number.isFinite(Number(locationPayload?.lng))
            ? ` | Loc: ${Number(locationPayload.lat)},${Number(locationPayload.lng)}`
            : '';

        const label = String(type || 'incident').toUpperCase();
        const senderLabel = currentUser.name || currentUser.email || 'user';
        const smsDraft = `${label} REPORT by ${senderLabel}${locationPart} | ${String(message).trim()}`;

        const record = await createInboundReportRecord({
            userId: currentUser._id,
            incidentId: incidentId || null,
            phone: resolvedPhone,
            message: smsDraft,
            meta: {
                source: 'web-offline-mode',
                location: locationPayload || null,
            },
        });

        return sendSuccess(res, {
            statusCode: StatusCodes.CREATED,
            msg: 'SMS report draft created successfully',
            data: {
                sms: record,
                smsDraft,
            },
        });
    } catch (error) {
        next(error);
    }
};

const notifyIncidentVictims = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req);
        if (!currentUser?._id) {
            throw new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }

        const { incidentId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(incidentId)) {
            throw new AppError('Invalid incident id', StatusCodes.BAD_REQUEST, 'INVALID_INCIDENT_ID');
        }

        const incident = await Incident.findById(incidentId).select('_id creatorId admins victims volunteers');
        if (!incident) {
            throw new AppError('Incident not found', StatusCodes.NOT_FOUND, 'INCIDENT_NOT_FOUND');
        }

        await ensureAdminCanNotify(incident, currentUser);

        const { kind, message, actorName } = req.body || {};
        if (!kind) {
            throw new AppError('kind is required', StatusCodes.BAD_REQUEST, 'SMS_KIND_REQUIRED');
        }

        const summary = await sendIncidentUpdateToVictims({
            incidentId,
            kind,
            customMessage: message || null,
            actorName: actorName || null,
            meta: {
                trigger: 'manual-admin-notify',
                requestedBy: currentUser._id,
            },
        });

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: 'Incident SMS notifications processed',
            data: {
                summary,
            },
        });
    } catch (error) {
        next(error);
    }
};

const getIncidentSmsLogs = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req);
        if (!currentUser?._id) {
            throw new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }

        const { incidentId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(incidentId)) {
            throw new AppError('Invalid incident id', StatusCodes.BAD_REQUEST, 'INVALID_INCIDENT_ID');
        }

        const incident = await Incident.findById(incidentId).select('_id creatorId victims volunteers admins');
        if (!incident) {
            throw new AppError('Incident not found', StatusCodes.NOT_FOUND, 'INCIDENT_NOT_FOUND');
        }

        await ensureIncidentVisible(incident, currentUser);

        const logs = await listIncidentSmsLogs({
            incidentId,
            limit: req.query.limit,
        });

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: 'Incident SMS logs fetched successfully',
            data: {
                logs,
            },
        });
    } catch (error) {
        next(error);
    }
};

const webhookIncomingSms = async (req, res, next) => {
    try {
        const sourceIp = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || 'unknown';
        console.log(`[SMS-WEBHOOK] Hit trace=${req.traceId || 'n/a'} ip=${sourceIp}`);

        const result = await processIncomingSmsWebhook({ payload: req.body || {} });

        console.log(
            `[SMS-WEBHOOK] Completed trace=${req.traceId || 'n/a'} duplicate=${result.duplicate} incident=${result.incidentId || 'n/a'} record=${result.smsRecordId || 'n/a'}`
        );

        return sendSuccess(res, {
            statusCode: result.duplicate ? StatusCodes.OK : StatusCodes.CREATED,
            msg: result.duplicate
                ? 'Duplicate SMS received. Existing incident kept.'
                : 'Incident created from inbound SMS webhook',
            data: result,
        });
    } catch (error) {
        console.error(`[SMS-WEBHOOK] Failed trace=${req.traceId || 'n/a'}:`, error?.message || error);
        next(error);
    }
};

const smsController = {
    webhookIncomingSms,
    createReportSms,
    notifyIncidentVictims,
    getIncidentSmsLogs,
};

module.exports = { smsController };
