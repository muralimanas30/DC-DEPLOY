const crypto = require('crypto');
const { StatusCodes } = require('http-status-codes');
const { AppError } = require('../../errorHandler/errorHandler');
const Incident = require('../../models/Incident');
const User = require('../../models/User');
const SmsMessage = require('../../models/SmsMessage');
const {
    TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER,
    NODE_ENV,
} = require('../../config');

const SMS_MAX_LENGTH = 320;
const INBOUND_DEDUPE_WINDOW_MS = 5 * 60 * 1000;

const toObjectIdString = (value) => value?.toString?.() || null;

const twilioConfigured = Boolean(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER);

const normalizePhone = (rawPhone) => {
    if (!rawPhone) return null;

    const value = String(rawPhone).trim();
    if (!value) return null;

    const digits = value.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) {
        return null;
    }

    return `+${digits}`;
};

const compactMessage = (rawMessage) => {
    const compact = String(rawMessage || '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!compact) return '';

    return compact.length > SMS_MAX_LENGTH
        ? `${compact.slice(0, SMS_MAX_LENGTH - 1)}...`
        : compact;
};

    const previewMessage = (rawMessage, maxLength = 120) => {
        const compact = compactMessage(rawMessage);
        if (!compact) return '';
        return compact.length <= maxLength
        ? compact
        : `${compact.slice(0, maxLength - 3)}...`;
    };

const normalizePointLocation = (rawLocation) => {
    if (!rawLocation || typeof rawLocation !== 'object') {
        return null;
    }

    if (
        rawLocation.type === 'Point'
        && Array.isArray(rawLocation.coordinates)
        && rawLocation.coordinates.length === 2
    ) {
        const lng = Number(rawLocation.coordinates[0]);
        const lat = Number(rawLocation.coordinates[1]);

        if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90) {
            return {
                type: 'Point',
                coordinates: [lng, lat],
            };
        }
    }

    return null;
};

const ensureGuestUserForPhone = async (normalizedPhone) => {
    const existingGuest = await User.findOne({ phone: normalizedPhone, isGuest: true });
    if (existingGuest) {
        console.log(`[SMS-WEBHOOK] Reusing guest user ${existingGuest._id} for ${normalizedPhone}`);
        return existingGuest;
    }

    const digits = normalizedPhone.replace(/\D/g, '');
    const email = `sms.guest.${digits}@guest.local`;

    const existingByEmail = await User.findOne({ email });
    if (existingByEmail) {
        if (!existingByEmail.phone) {
            existingByEmail.phone = normalizedPhone;
        }
        if (!existingByEmail.isGuest) {
            existingByEmail.isGuest = true;
        }
        if (!Array.isArray(existingByEmail.roles) || !existingByEmail.roles.includes('victim')) {
            existingByEmail.roles = ['victim'];
        }
        if (existingByEmail.activeRole !== 'victim') {
            existingByEmail.activeRole = 'victim';
        }

        await existingByEmail.save();
        console.log(`[SMS-WEBHOOK] Upgraded existing user ${existingByEmail._id} as guest for ${normalizedPhone}`);
        return existingByEmail;
    }

    const suffix = digits.slice(-4) || 'user';
    const createdGuest = await User.create({
        name: `Guest ${suffix}`,
        email,
        oauth: true,
        provider: 'sms-gateway',
        roles: ['victim'],
        activeRole: 'victim',
        phone: normalizedPhone,
        isGuest: true,
    });

    console.log(`[SMS-WEBHOOK] Created guest user ${createdGuest._id} for ${normalizedPhone}`);
    return createdGuest;
};

const inferSeverityFromText = (message) => {
    const content = String(message || '').toLowerCase();

    if (/(critical|massive fire|major accident|building collapse|explosion|unconscious)/i.test(content)) {
        return 'critical';
    }

    if (/(urgent|emergency|fire|accident|injury|flood|earthquake|trapped|help)/i.test(content)) {
        return 'high';
    }

    return 'medium';
};

const buildInboundDedupeKey = ({ from, text, sentStamp }) => {
    const raw = `${from}|${text}|${sentStamp}`;
    return crypto.createHash('sha256').update(raw).digest('hex');
};

const parsePointFromLoc = (rawLoc) => {
    const value = String(rawLoc || '').trim();
    if (!value) return null;

    const [latRaw, lngRaw] = value.split(',').map((item) => String(item || '').trim());
    const lat = Number(latRaw);
    const lng = Number(lngRaw);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

    return {
        type: 'Point',
        coordinates: [lng, lat],
    };
};

const parseDcReportMessage = (text) => {
    const compact = compactMessage(text);
    if (!compact || !/^DC_REPORT\s*\|/i.test(compact)) {
        return null;
    }

    const segments = compact.split('|').map((part) => String(part || '').trim()).filter(Boolean);
    const parsed = {
        type: 'incident',
        reference: null,
        fromLabel: null,
        email: null,
        phone: null,
        location: null,
        details: null,
    };

    for (const segment of segments) {
        const separatorIndex = segment.indexOf(':');
        if (separatorIndex === -1) continue;

        const rawKey = segment.slice(0, separatorIndex).trim().toUpperCase();
        const rawValue = segment.slice(separatorIndex + 1).trim();
        if (!rawValue) continue;

        if (rawKey === 'TYPE') {
            const normalizedType = rawValue.toLowerCase();
            parsed.type = normalizedType === 'alert' ? 'alert' : 'incident';
            continue;
        }

        if (rawKey === 'REF') {
            parsed.reference = rawValue;
            continue;
        }

        if (rawKey === 'FROM') {
            parsed.fromLabel = rawValue;
            continue;
        }

        if (rawKey === 'EMAIL') {
            parsed.email = rawValue;
            continue;
        }

        if (rawKey === 'PHONE') {
            parsed.phone = normalizePhone(rawValue) || rawValue;
            continue;
        }

        if (rawKey === 'LOC') {
            parsed.location = parsePointFromLoc(rawValue);
            continue;
        }

        if (rawKey === 'DETAILS') {
            parsed.details = rawValue;
        }
    }

    return parsed;
};

const parseGatewayPayload = (payload = {}) => {
    const from = normalizePhone(payload.from || payload.sender || payload.phone);
    const text = compactMessage(payload.text || payload.message || payload.body || '');

    if (!from) {
        throw new AppError('Invalid sender phone in SMS webhook payload', StatusCodes.BAD_REQUEST, 'SMS_WEBHOOK_INVALID_FROM');
    }

    if (!text) {
        throw new AppError('SMS webhook payload requires non-empty text', StatusCodes.BAD_REQUEST, 'SMS_WEBHOOK_EMPTY_TEXT');
    }

    const sentStampNum = Number(payload.sentStamp);
    const receivedStampNum = Number(payload.receivedStamp);

    return {
        from,
        text,
        parsedReport: parseDcReportMessage(text),
        sentStamp: Number.isFinite(sentStampNum) ? Math.trunc(sentStampNum) : Date.now(),
        receivedStamp: Number.isFinite(receivedStampNum) ? Math.trunc(receivedStampNum) : Date.now(),
        sim: String(payload.sim || 'undetected').trim() || 'undetected',
        raw: payload,
    };
};

const findRecentInboundDuplicate = async ({ from, text, sentStamp, dedupeKey }) => {
    const windowStart = new Date(Date.now() - INBOUND_DEDUPE_WINDOW_MS);

    return SmsMessage.findOne({
        direction: 'inbound',
        kind: 'incident-report',
        from,
        createdAt: { $gte: windowStart },
        $or: [
            { 'meta.dedupeKey': dedupeKey },
            { message: text, 'meta.sentStamp': sentStamp },
        ],
    })
        .sort({ createdAt: -1 })
        .lean();
};

const ensureUserForPhone = async (normalizedPhone) => {
    const existingUser = await User.findOne({ phone: normalizedPhone });
    if (existingUser) {
        console.log(`[SMS-WEBHOOK] Matched existing user ${existingUser._id} for ${normalizedPhone} guest=${Boolean(existingUser.isGuest)}`);
        return existingUser;
    }

    return ensureGuestUserForPhone(normalizedPhone);
};

const buildIncidentFromInboundSms = async ({ from, text, parsedReport, sim, sentStamp, receivedStamp, raw }) => {
    const linkedUser = await ensureUserForPhone(from);

    const severity = inferSeverityFromText(parsedReport?.details || text);
    const typeLabel = parsedReport?.type === 'alert' ? 'Alert' : 'Incident';
    const sourceLabel = parsedReport?.fromLabel || linkedUser?.name || from;
    const refLabel = parsedReport?.reference ? ` (${parsedReport.reference})` : '';

    const title = `${typeLabel} SMS from ${sourceLabel}${refLabel}`.slice(0, 200);
    const description = [
        parsedReport?.details || text,
        '',
        `Sender: ${from}`,
        `LinkedUser: ${linkedUser?.name || linkedUser?.email || linkedUser?._id || 'n/a'}`,
        parsedReport?.email ? `Email: ${parsedReport.email}` : null,
        parsedReport?.phone ? `Phone: ${parsedReport.phone}` : null,
        parsedReport?.reference ? `Reference: ${parsedReport.reference}` : null,
        `SIM: ${sim}`,
        `SentStamp: ${sentStamp}`,
        `ReceivedStamp: ${receivedStamp}`,
    ].filter(Boolean).join('\n').slice(0, 2000);

    const location = parsedReport?.location
        || normalizePointLocation(linkedUser.currentLocation)
        || { type: 'Point', coordinates: [0, 0] };

    const incident = await Incident.create({
        title,
        description,
        category: 'sms-gateway',
        severity,
        location,
        creatorId: linkedUser._id,
        creatorRole: 'victim',
        victims: [linkedUser._id],
        volunteers: [],
        admins: [],
    });

    if (!linkedUser.assignedIncident) {
        linkedUser.assignedIncident = incident._id;
    }

    if (linkedUser.isGuest) {
        if (linkedUser.activeRole !== 'victim') {
            linkedUser.activeRole = 'victim';
        }
        if (!Array.isArray(linkedUser.roles) || !linkedUser.roles.includes('victim')) {
            linkedUser.roles = ['victim'];
        }
    }

    await linkedUser.save();

    return { incident, linkedUser, raw };
};

const deliverThroughTwilio = async ({ to, body }) => {
    if (!twilioConfigured) {
        return {
            status: 'simulated',
            providerMessageId: null,
            errorMessage: null,
            providerPayload: {
                reason: 'TWILIO_NOT_CONFIGURED',
            },
        };
    }

    if (typeof fetch !== 'function') {
        return {
            status: 'simulated',
            providerMessageId: null,
            errorMessage: null,
            providerPayload: {
                reason: 'FETCH_UNAVAILABLE',
            },
        };
    }

    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
    const payload = new URLSearchParams({
        To: to,
        From: TWILIO_PHONE_NUMBER,
        Body: body,
    });

    const authHeader = `Basic ${Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64')}`;

    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutHandle = abortController
        ? setTimeout(() => abortController.abort(), 10000)
        : null;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: authHeader,
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: payload,
            signal: abortController?.signal,
        });

        const parsed = await response.json().catch(() => ({}));

        if (!response.ok) {
            return {
                status: 'failed',
                providerMessageId: null,
                errorMessage: parsed?.message || `Twilio send failed with status ${response.status}`,
                providerPayload: parsed,
            };
        }

        return {
            status: 'sent',
            providerMessageId: parsed?.sid || null,
            errorMessage: null,
            providerPayload: parsed,
        };
    } catch (error) {
        return {
            status: 'failed',
            providerMessageId: null,
            errorMessage: error?.message || 'Twilio request failed',
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
    phone,
    message,
    meta = null,
    provider = 'manual',
    kind = 'incident-report',
    status = 'received',
    to = null,
}) => {
    const normalizedPhone = normalizePhone(phone);
    const compact = compactMessage(message);

    if (!compact) return null;

    return SmsMessage.create({
        channel: 'sms',
        direction: 'inbound',
        kind,
        status,
        to: to || TWILIO_PHONE_NUMBER || null,
        from: normalizedPhone,
        userId: userId || null,
        incidentId: incidentId || null,
        message: compact,
        provider,
        meta,
    });
};

const processIncomingSmsWebhook = async ({ payload = {} }) => {
    const incoming = parseGatewayPayload(payload);
    console.log(
        `[SMS-WEBHOOK] Parsed sender=${incoming.from} sim=${incoming.sim} sent=${incoming.sentStamp} text="${previewMessage(incoming.text)}"`
    );

    const dedupeKey = buildInboundDedupeKey(incoming);

    const duplicate = await findRecentInboundDuplicate({
        from: incoming.from,
        text: incoming.text,
        sentStamp: incoming.sentStamp,
        dedupeKey,
    });

    if (duplicate) {
        console.log(
            `[SMS-WEBHOOK] Duplicate detected key=${dedupeKey} incident=${duplicate.incidentId || 'n/a'} record=${duplicate._id}`
        );
        return {
            duplicate: true,
            dedupeKey,
            incidentId: duplicate.incidentId || null,
            smsRecordId: duplicate._id,
        };
    }

    const { incident, linkedUser } = await buildIncidentFromInboundSms(incoming);

    const smsRecord = await createInboundReportRecord({
        userId: linkedUser._id,
        incidentId: incident._id,
        phone: incoming.from,
        message: incoming.text,
        provider: 'sms-gateway',
        meta: {
            source: 'android_income_sms_gateway_webhook',
            dedupeKey,
            sentStamp: incoming.sentStamp,
            receivedStamp: incoming.receivedStamp,
            sim: incoming.sim,
            parsedReport: incoming.parsedReport || null,
            raw: incoming.raw,
        },
    });

    console.log(
        `[SMS-WEBHOOK] Incident created id=${incident._id} user=${linkedUser._id} sender=${incoming.from} severity=${incident.severity}`
    );

    return {
        duplicate: false,
        dedupeKey,
        incidentId: incident._id,
        linkedUserId: linkedUser._id,
        guestUserId: linkedUser.isGuest ? linkedUser._id : null,
        smsRecordId: smsRecord?._id || null,
    };
};

const sendSmsAndPersist = async ({
    toUserId = null,
    incidentId = null,
    toPhone,
    kind = 'custom',
    message,
    meta = null,
}) => {
    const normalizedPhone = normalizePhone(toPhone);
    const compact = compactMessage(message);

    if (!normalizedPhone || !compact) {
        return null;
    }

    const record = await SmsMessage.create({
        channel: 'sms',
        direction: 'outbound',
        kind,
        status: 'queued',
        to: normalizedPhone,
        from: TWILIO_PHONE_NUMBER || null,
        message: compact,
        userId: toUserId || null,
        incidentId: incidentId || null,
        provider: 'twilio',
        meta,
    });

    const delivery = await deliverThroughTwilio({
        to: normalizedPhone,
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
        console.log(`[SMS] Simulated send to ${normalizedPhone}: ${compact}`);
    }

    if (record.status === 'failed') {
        console.error(`[SMS] Send failed to ${normalizedPhone}: ${record.errorMessage}`);
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

    const victims = await User.find({ _id: { $in: victimIds } }).select('_id name email phone').lean();

    const message = buildIncidentMessage({
        kind,
        incident,
        actorName,
        customMessage,
    });

    const results = await Promise.allSettled(victims.map((victim) => sendSmsAndPersist({
        toUserId: victim._id,
        incidentId: incident._id,
        toPhone: victim.phone,
        kind,
        message,
        meta,
    })));

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

const listIncidentSmsLogs = async ({ incidentId, limit = 100 }) => SmsMessage.find({ incidentId })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 200)))
    .lean();

module.exports = {
    normalizePhone,
    createInboundReportRecord,
    processIncomingSmsWebhook,
    sendIncidentUpdateToVictims,
    notifyIncidentReceived,
    notifyIncidentWorking,
    notifyVolunteerAssigned,
    notifyIncidentResolved,
    notifyHighSeverityAlert,
    listIncidentSmsLogs,
};
