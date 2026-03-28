const { StatusCodes } = require('http-status-codes');
const mongoose = require('mongoose');
const { AppError } = require('../errorHandler/errorHandler');
const Incident = require('../models/Incident');
const User = require('../models/User');
const { sendSuccess } = require('../utils/response');
const { TELEGRAM_WEBHOOK_SECRET } = require('../config');
const {
    normalizeTelegramId,
    normalizeTelegramUsername,
    createInboundReportRecord,
    sendIncidentUpdateToVictims,
    listIncidentTelegramLogs,
    applyWebhookUpdate,
} = require('../services/telegram');

const toObjectIdString = (value) => value?.toString?.() || null;

const getCurrentUser = async (req) => {
    const rawUserId = req.user?.id || req.user?._id || req.userId;

    const byId = (rawUserId && mongoose.Types.ObjectId.isValid(rawUserId))
        ? await User.findById(rawUserId).select('_id name email telegramId telegramUsername activeRole')
        : null;

    if (byId) return byId;

    if (req.user?.email) {
        return User.findOne({ email: req.user.email }).select('_id name email telegramId telegramUsername activeRole');
    }

    return null;
};

const ensureAdminCanNotify = async (incident, user) => {
    const meId = toObjectIdString(user?._id);
    const isPlatformAdmin = user?.activeRole === 'admin';
    const isIncidentAdmin = (incident.admins || []).some((id) => toObjectIdString(id) === meId);

    if (!isPlatformAdmin && !isIncidentAdmin) {
        throw new AppError('Only admins can send incident Telegram notifications', StatusCodes.FORBIDDEN, 'TELEGRAM_NOTIFY_FORBIDDEN');
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
        throw new AppError('You are not allowed to view Telegram logs for this incident', StatusCodes.FORBIDDEN, 'TELEGRAM_LOGS_FORBIDDEN');
    }
};

const createReportTelegram = async (req, res, next) => {
    try {
        const currentUser = await getCurrentUser(req);
        if (!currentUser?._id) {
            throw new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }

        const {
            incidentId,
            type = 'incident',
            message,
            telegramId,
            telegramUsername,
            location,
            lat,
            lng,
        } = req.body || {};

        if (!message || !String(message).trim()) {
            throw new AppError('message is required', StatusCodes.BAD_REQUEST, 'TELEGRAM_REPORT_MESSAGE_REQUIRED');
        }

        if (incidentId && !mongoose.Types.ObjectId.isValid(incidentId)) {
            throw new AppError('Invalid incidentId', StatusCodes.BAD_REQUEST, 'INVALID_INCIDENT_ID');
        }

        const resolvedTelegramId = normalizeTelegramId(telegramId || currentUser.telegramId);
        const resolvedTelegramUsername = normalizeTelegramUsername(telegramUsername || currentUser.telegramUsername);

        if (!resolvedTelegramId && !resolvedTelegramUsername) {
            throw new AppError(
                'A telegram id or telegram username is required',
                StatusCodes.BAD_REQUEST,
                'TELEGRAM_REPORT_RECIPIENT_REQUIRED'
            );
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
        const telegramDraft = `${label} REPORT by ${senderLabel}${locationPart} | ${String(message).trim()}`;

        const record = await createInboundReportRecord({
            userId: currentUser._id,
            incidentId: incidentId || null,
            telegramId: resolvedTelegramId,
            telegramUsername: resolvedTelegramUsername,
            message: telegramDraft,
            meta: {
                source: 'web-offline-mode',
                location: locationPayload || null,
            },
        });

        return sendSuccess(res, {
            statusCode: StatusCodes.CREATED,
            msg: 'Telegram report draft created successfully',
            data: {
                telegram: record,
                telegramDraft,
            },
        });
    } catch (error) {
        next(error);
    }
};

const notifyIncidentVictimsTelegram = async (req, res, next) => {
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
            throw new AppError('kind is required', StatusCodes.BAD_REQUEST, 'TELEGRAM_KIND_REQUIRED');
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
            msg: 'Incident Telegram notifications processed',
            data: {
                summary,
            },
        });
    } catch (error) {
        next(error);
    }
};

const getIncidentTelegramLogs = async (req, res, next) => {
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

        const logs = await listIncidentTelegramLogs({
            incidentId,
            limit: req.query.limit,
        });

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: 'Incident Telegram logs fetched successfully',
            data: {
                logs,
            },
        });
    } catch (error) {
        next(error);
    }
};

const webhookHandler = async (req, res, next) => {
    try {
        if (TELEGRAM_WEBHOOK_SECRET) {
            const providedSecret = req.headers['x-telegram-bot-api-secret-token'];
            if (!providedSecret || providedSecret !== TELEGRAM_WEBHOOK_SECRET) {
                throw new AppError('Invalid webhook secret', StatusCodes.UNAUTHORIZED, 'TELEGRAM_WEBHOOK_UNAUTHORIZED');
            }
        }

        const webhookSummary = await applyWebhookUpdate({ update: req.body || {} });

        return res.status(StatusCodes.OK).json({
            ok: true,
            status: 'success',
            statusCode: StatusCodes.OK,
            data: webhookSummary,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        next(error);
    }
};

const telegramController = {
    createReportTelegram,
    notifyIncidentVictimsTelegram,
    getIncidentTelegramLogs,
    webhookHandler,
};

module.exports = { telegramController };