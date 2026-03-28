const Incident = require('../../models/Incident');
const User = require('../../models/User');
const TelegramMessage = require('../../models/TelegramMessage');
const {
    TELEGRAM_BOT_TOKEN,
    NODE_ENV,
} = require('../../config');
const {
    normalizeTelegramId,
    normalizeTelegramUsername,
} = require('../../utils/telegram');

const TELEGRAM_MAX_LENGTH = 4000;

const toObjectIdString = (value) => value?.toString?.() || null;

const telegramConfigured = Boolean(TELEGRAM_BOT_TOKEN);

const compactMessage = (rawMessage) => {
    const compact = String(rawMessage || '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!compact) return '';

    return compact.length > TELEGRAM_MAX_LENGTH
        ? `${compact.slice(0, TELEGRAM_MAX_LENGTH - 1)}...`
        : compact;
};

const deliverThroughTelegram = async ({ chatId, body }) => {
    if (!telegramConfigured) {
        return {
            status: 'simulated',
            providerMessageId: null,
            errorMessage: null,
            providerPayload: {
                reason: 'TELEGRAM_NOT_CONFIGURED',
            },
        };
    }

    if (typeof fetch !== 'function') {
        return {
            status: 'failed',
            providerMessageId: null,
            errorMessage: 'Fetch API unavailable',
            providerPayload: {
                reason: 'FETCH_UNAVAILABLE',
            },
        };
    }

    const endpoint = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutHandle = abortController
        ? setTimeout(() => abortController.abort(), 10000)
        : null;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: chatId,
                text: body,
                disable_web_page_preview: true,
            }),
            signal: abortController?.signal,
        });

        const parsed = await response.json().catch(() => ({}));

        if (!response.ok || !parsed?.ok) {
            return {
                status: 'failed',
                providerMessageId: null,
                errorMessage: parsed?.description || `Telegram send failed with status ${response.status}`,
                providerPayload: parsed,
            };
        }

        return {
            status: 'sent',
            providerMessageId: String(parsed?.result?.message_id || ''),
            errorMessage: null,
            providerPayload: parsed,
        };
    } catch (error) {
        return {
            status: 'failed',
            providerMessageId: null,
            errorMessage: error?.message || 'Telegram request failed',
            providerPayload: {
                errorName: error?.name || 'Error',
            },
        };
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    }
};

const createInboundReportRecord = async ({
    userId,
    incidentId,
    telegramId,
    telegramUsername,
    message,
    meta = null,
}) => {
    const normalizedTelegramId = normalizeTelegramId(telegramId);
    const normalizedTelegramUsername = normalizeTelegramUsername(telegramUsername);
    const compact = compactMessage(message);

    if (!compact) return null;

    return TelegramMessage.create({
        channel: 'telegram',
        direction: 'inbound',
        kind: 'incident-report',
        status: 'received',
        to: null,
        from: normalizedTelegramId || (normalizedTelegramUsername ? `@${normalizedTelegramUsername}` : null),
        recipientTelegramId: normalizedTelegramId,
        recipientTelegramUsername: normalizedTelegramUsername,
        userId: userId || null,
        incidentId: incidentId || null,
        message: compact,
        provider: 'manual',
        meta,
    });
};

const sendTelegramAndPersist = async ({
    toUserId = null,
    incidentId = null,
    toTelegramId = null,
    toTelegramUsername = null,
    kind = 'custom',
    message,
    meta = null,
}) => {
    const normalizedTelegramId = normalizeTelegramId(toTelegramId);
    const normalizedTelegramUsername = normalizeTelegramUsername(toTelegramUsername);
    const compact = compactMessage(message);

    const chatId = normalizedTelegramId || (normalizedTelegramUsername ? `@${normalizedTelegramUsername}` : null);
    if (!chatId || !compact) {
        return null;
    }

    const record = await TelegramMessage.create({
        channel: 'telegram',
        direction: 'outbound',
        kind,
        status: 'queued',
        to: chatId,
        from: 'bot',
        recipientTelegramId: normalizedTelegramId,
        recipientTelegramUsername: normalizedTelegramUsername,
        message: compact,
        userId: toUserId || null,
        incidentId: incidentId || null,
        provider: 'telegram-bot-api',
        meta,
    });

    const delivery = await deliverThroughTelegram({
        chatId,
        body: compact,
    });

    record.status = delivery.status;
    record.providerMessageId = delivery.providerMessageId;
    record.errorMessage = delivery.errorMessage;
    record.meta = {
        ...(record.meta || {}),
        delivery: delivery.providerPayload || null,
        environment: NODE_ENV,
    };

    await record.save();

    if (record.status === 'simulated') {
        console.log(`[TELEGRAM] Simulated send to ${chatId}: ${compact}`);
    }

    if (record.status === 'failed') {
        console.error(`[TELEGRAM] Send failed to ${chatId}: ${record.errorMessage}`);
    }

    return record;
};

const buildIncidentMessage = ({ kind, incident, actorName, customMessage }) => {
    if (customMessage) {
        return compactMessage(customMessage);
    }

    const incidentRef = toObjectIdString(incident?._id)?.slice(-6)?.toUpperCase() || 'N/A';

    if (kind === 'incident-received') {
        return `Incident received (${incidentRef}). Our team is reviewing your report.`;
    }

    if (kind === 'incident-working') {
        return `Update (${incidentRef}): Response team is working on your incident.`;
    }

    if (kind === 'volunteer-assigned') {
        const volunteerText = actorName ? ` ${actorName}` : '';
        return `Update (${incidentRef}): Volunteer${volunteerText} assigned. Help is on the way.`;
    }

    if (kind === 'incident-resolved') {
        return `Update (${incidentRef}): Incident marked resolved. Stay safe.`;
    }

    if (kind === 'high-severity-alert') {
        return `ALERT (${incidentRef}): High severity incident detected. Follow safety guidance.`;
    }

    return compactMessage(customMessage || `Incident update (${incidentRef}).`);
};

const sendIncidentUpdateToVictims = async ({
    incidentId,
    kind,
    actorName = null,
    customMessage = null,
    meta = null,
}) => {
    const incident = await Incident.findById(incidentId).select('_id title severity victims');
    if (!incident) {
        return {
            attempted: 0,
            sent: 0,
            simulated: 0,
            failed: 0,
        };
    }

    const victimIds = (incident.victims || []).map((id) => toObjectIdString(id)).filter(Boolean);
    if (!victimIds.length) {
        return {
            attempted: 0,
            sent: 0,
            simulated: 0,
            failed: 0,
        };
    }

    const victims = await User.find({ _id: { $in: victimIds } })
        .select('_id name email telegramId telegramUsername telegramNotificationsEnabled')
        .lean();

    const message = buildIncidentMessage({
        kind,
        incident,
        actorName,
        customMessage,
    });

    const results = await Promise.allSettled(victims.map((victim) => {
        if (victim.telegramNotificationsEnabled === false) {
            return null;
        }

        return sendTelegramAndPersist({
            toUserId: victim._id,
            incidentId: incident._id,
            toTelegramId: victim.telegramId,
            toTelegramUsername: victim.telegramUsername,
            kind,
            message,
            meta,
        });
    }));

    const summary = {
        attempted: victims.length,
        sent: 0,
        simulated: 0,
        failed: 0,
    };

    for (const result of results) {
        if (result.status === 'rejected') {
            summary.failed += 1;
            continue;
        }

        const record = result.value;
        if (!record) {
            summary.failed += 1;
            continue;
        }

        if (record.status === 'sent') summary.sent += 1;
        else if (record.status === 'simulated') summary.simulated += 1;
        else summary.failed += 1;
    }

    return summary;
};

const applyWebhookUpdate = async ({ update }) => {
    const messagePayload = update?.message || update?.edited_message;
    const chat = messagePayload?.chat || {};
    const from = messagePayload?.from || {};
    const text = compactMessage(messagePayload?.text || '');

    const telegramId = normalizeTelegramId(chat?.id || from?.id);
    const telegramUsername = normalizeTelegramUsername(from?.username);

    let linkedUser = null;
    if (telegramId) {
        linkedUser = await User.findOne({ telegramId });
    }

    if (!linkedUser && telegramUsername) {
        linkedUser = await User.findOne({ telegramUsername });
    }

    if (linkedUser) {
        let shouldSave = false;

        if (telegramId && linkedUser.telegramId !== telegramId) {
            linkedUser.telegramId = telegramId;
            shouldSave = true;
        }

        if (telegramUsername && linkedUser.telegramUsername !== telegramUsername) {
            linkedUser.telegramUsername = telegramUsername;
            shouldSave = true;
        }

        if (linkedUser.telegramNotificationsEnabled === false) {
            linkedUser.telegramNotificationsEnabled = true;
            shouldSave = true;
        }

        if (shouldSave) {
            await linkedUser.save();
        }
    }

    if (text) {
        await TelegramMessage.create({
            channel: 'telegram',
            direction: 'inbound',
            kind: 'custom',
            status: 'received',
            to: 'bot',
            from: telegramId || (telegramUsername ? `@${telegramUsername}` : null),
            recipientTelegramId: telegramId,
            recipientTelegramUsername: telegramUsername,
            userId: linkedUser?._id || null,
            incidentId: null,
            message: text,
            provider: 'telegram-bot-api',
            meta: {
                updateId: update?.update_id,
            },
        });
    }

    return {
        linkedUserId: linkedUser?._id?.toString?.() || null,
        telegramId,
        telegramUsername,
        receivedText: Boolean(text),
    };
};

const notifyIncidentReceived = ({ incidentId }) => sendIncidentUpdateToVictims({
    incidentId,
    kind: 'incident-received',
});

const notifyIncidentWorking = ({ incidentId }) => sendIncidentUpdateToVictims({
    incidentId,
    kind: 'incident-working',
});

const notifyVolunteerAssigned = ({ incidentId, volunteerName }) => sendIncidentUpdateToVictims({
    incidentId,
    kind: 'volunteer-assigned',
    actorName: volunteerName || null,
});

const notifyIncidentResolved = ({ incidentId }) => sendIncidentUpdateToVictims({
    incidentId,
    kind: 'incident-resolved',
});

const notifyHighSeverityAlert = ({ incidentId }) => sendIncidentUpdateToVictims({
    incidentId,
    kind: 'high-severity-alert',
});

const listIncidentTelegramLogs = async ({ incidentId, limit = 100 }) => TelegramMessage.find({ incidentId })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 200)))
    .lean();

module.exports = {
    normalizeTelegramId,
    normalizeTelegramUsername,
    createInboundReportRecord,
    sendIncidentUpdateToVictims,
    notifyIncidentReceived,
    notifyIncidentWorking,
    notifyVolunteerAssigned,
    notifyIncidentResolved,
    notifyHighSeverityAlert,
    listIncidentTelegramLogs,
    applyWebhookUpdate,
};