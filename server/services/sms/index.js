const crypto = require('crypto');
const { StatusCodes } = require('http-status-codes');
const { AppError } = require('../../errorHandler/errorHandler');
const Incident = require('../../models/Incident');
const User = require('../../models/User');
const SmsMessage = require('../../models/SmsMessage');
const { sendEmail } = require('../email');
const { normalizePhone } = require('../../utils/phone');
const { logger } = require('../../utils/logger');
const {
    SMS_GATE_BASE_URL,
    SMS_GATE_AUTH_MODE,
    SMS_GATE_USERNAME,
    SMS_GATE_PASSWORD,
    SMS_GATE_ACCESS_TOKEN,
    SMS_GATE_DEFAULT_DEVICE_ID,
    SMS_GATE_DEFAULT_SIM_NUMBER,
    SMS_GATE_SKIP_PHONE_VALIDATION,
    SMS_GATE_DEVICE_ACTIVE_WITHIN_HOURS,
    SMS_GATE_WEBHOOK_SIGNING_KEY,
    SMS_GATE_OUTBOUND_FROM,
    SMS_TEST_TARGET_PHONE,
    NODE_ENV,
} = require('../../config');

const SMS_MAX_LENGTH = 320;
const INBOUND_DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const WEBHOOK_TIMESTAMP_MAX_DRIFT_SEC = 5 * 60;
const SMS_GATE_PROVIDER_NAME = 'sms-gate';

const toObjectIdString = (value) => value?.toString?.() || null;

const normalizeBaseUrl = (rawBaseUrl) => {
    const value = String(rawBaseUrl || '').trim();
    if (!value) return '';

    const withProtocol = /^https?:\/\//i.test(value)
        ? value
        : `http://${value}`;

    return withProtocol.replace(/\/+$/, '');
};

const smsGateBaseUrl = normalizeBaseUrl(SMS_GATE_BASE_URL);
const smsGateBasicConfigured = Boolean(SMS_GATE_USERNAME && SMS_GATE_PASSWORD);
const smsGateBearerConfigured = Boolean(SMS_GATE_ACCESS_TOKEN);
const smsGateConfigured = Boolean(smsGateBaseUrl) && (smsGateBasicConfigured || smsGateBearerConfigured);

const safeEquals = (left, right) => {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    if (leftBuffer.length !== rightBuffer.length) return false;
    return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const isSmsGateCloudLikeBaseUrl = (baseUrl = smsGateBaseUrl) => String(baseUrl || '').toLowerCase().includes('api.sms-gate.app');

const toBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    return String(value || '').trim().toLowerCase() === 'true';
};

const parseIsoToEpochMs = (value) => {
    const parsed = Date.parse(String(value || ''));
    return Number.isFinite(parsed) ? parsed : null;
};

const toSmsGatewayPhoneNumber = (rawPhone) => {
    const local = normalizePhone(rawPhone);
    if (!local) return null;
    return `+91${local}`;
};

const probeSmsGatewayReachability = async () => {
    if (!smsGateBaseUrl) {
        return {
            reachable: null,
            reason: 'BASE_URL_MISSING',
            statusCode: null,
        };
    }

    if (typeof fetch !== 'function') {
        return {
            reachable: null,
            reason: 'FETCH_UNAVAILABLE',
            statusCode: null,
        };
    }

    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutHandle = abortController
        ? setTimeout(() => abortController.abort(), 5000)
        : null;

    try {
        const probePaths = ['/messages', '/device', ''];
        let lastResponse = null;
        let lastPath = '';

        for (const path of probePaths) {
            const response = await fetch(`${smsGateBaseUrl}${path}`, {
                method: 'GET',
                headers: {
                    ...getSmsGateAuthHeaders(),
                },
                signal: abortController?.signal,
            });

            lastResponse = response;
            lastPath = path || '/';

            // 404 on one endpoint may still be fine across API variants; continue probing.
            if (response.status !== 404) {
                break;
            }
        }

        return {
            reachable: true,
            reason: 'HTTP_RESPONSE',
            statusCode: lastResponse?.status || null,
            endpoint: lastPath,
        };
    } catch (error) {
        return {
            reachable: false,
            reason: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_ERROR',
            statusCode: null,
            errorMessage: error?.message || 'Unknown error',
        };
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    }
};

const logSmsStartupReadiness = async () => {
    const authMode = String(SMS_GATE_AUTH_MODE || 'basic').trim().toLowerCase();
    const effectiveAuthMode = authMode === 'bearer' ? 'bearer' : 'basic';
    const hasCredentials = effectiveAuthMode === 'bearer'
        ? smsGateBearerConfigured
        : smsGateBasicConfigured;

    logger.notify(
        `SMS startup check baseUrl=${logger.highlight(smsGateBaseUrl || 'not-set')} authMode=${logger.highlight(effectiveAuthMode)} creds=${logger.highlight(hasCredentials ? 'present' : 'missing')}`
    );

    logger.notify(
        `SMS webhook signing=${logger.highlight(SMS_GATE_WEBHOOK_SIGNING_KEY ? 'enabled' : 'disabled')} deviceId=${logger.highlight(SMS_GATE_DEFAULT_DEVICE_ID || 'auto')} sim=${logger.highlight(SMS_GATE_DEFAULT_SIM_NUMBER || 'auto')}`
    );

    if (!smsGateConfigured) {
        logger.warn('notify', 'SMS gateway is not fully configured. Outbound SMS will run in simulated mode.');
        return {
            configured: false,
            reachable: null,
            mode: effectiveAuthMode,
            baseUrl: smsGateBaseUrl || null,
        };
    }

    logger.success('notify', `SMS gateway config looks valid for ${logger.highlight(SMS_GATE_PROVIDER_NAME)}.`);

    const reachability = await probeSmsGatewayReachability();
    if (reachability.reachable) {
        const statusCode = Number(reachability.statusCode) || 0;
        if (statusCode >= 200 && statusCode < 300) {
            logger.success(
                'notify',
                `SMS gateway reachable status=${logger.highlight(statusCode)} endpoint=${logger.highlight(reachability.endpoint || '/')} url=${logger.highlight(smsGateBaseUrl)}`
            );
        } else if (statusCode === 401 || statusCode === 403) {
            logger.warn(
                'notify',
                `SMS gateway auth failed status=${logger.highlight(statusCode)} endpoint=${logger.highlight(reachability.endpoint || '/')} . Check SMS_GATE_AUTH_MODE and credentials/token.`
            );
        } else {
            logger.warn(
                'notify',
                `SMS gateway reachable but unhealthy status=${logger.highlight(statusCode)} endpoint=${logger.highlight(reachability.endpoint || '/')} url=${logger.highlight(smsGateBaseUrl)}`
            );
        }
    } else if (reachability.reachable === false) {
        logger.warn(
            'notify',
            `SMS gateway not reachable reason=${logger.highlight(reachability.reason)} error=${logger.highlight(reachability.errorMessage || 'n/a')}`
        );
    } else {
        logger.warn('notify', `SMS gateway reachability skipped reason=${logger.highlight(reachability.reason)}`);
    }

    return {
        configured: true,
        reachable: reachability.reachable,
        mode: effectiveAuthMode,
        baseUrl: smsGateBaseUrl,
        statusCode: reachability.statusCode || null,
    };
};

const verifySmsGateWebhookSignature = ({ rawBody, headers }) => {
    if (!SMS_GATE_WEBHOOK_SIGNING_KEY) {
        return { valid: true, reason: 'SIGNING_DISABLED' };
    }

    if (isSmsGateCloudLikeBaseUrl()) {
        return { valid: true, reason: 'CLOUD_SIGNATURE_OPTIONAL' };
    }

    const signatureHeader = headers?.['x-signature'] || headers?.['X-Signature'];
    const timestampHeader = headers?.['x-timestamp'] || headers?.['X-Timestamp'];
    const timestamp = Number(timestampHeader);

    if (!signatureHeader || !Number.isFinite(timestamp)) {
        return { valid: false, reason: 'MISSING_SIGNATURE_HEADERS' };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestamp) > WEBHOOK_TIMESTAMP_MAX_DRIFT_SEC) {
        return { valid: false, reason: 'STALE_TIMESTAMP' };
    }

    const message = `${String(rawBody || '')}${String(timestampHeader)}`;
    const expected = crypto
        .createHmac('sha256', SMS_GATE_WEBHOOK_SIGNING_KEY)
        .update(message)
        .digest('hex');

    if (!safeEquals(expected, String(signatureHeader).toLowerCase())) {
        return { valid: false, reason: 'SIGNATURE_MISMATCH' };
    }

    return { valid: true, reason: 'OK' };
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
    const phoneCandidates = [normalizedPhone, `+${normalizedPhone}`, `+91${normalizedPhone}`, `91${normalizedPhone}`];
    const existingGuest = await User.findOne({ phone: { $in: phoneCandidates }, isGuest: true });
    if (existingGuest) {
        logger.webhook(`Reusing guest user ${logger.highlight(existingGuest._id)} for ${logger.highlight(normalizedPhone)}`);
        return existingGuest;
    }

    const digits = normalizedPhone.replace(/\D/g, '');
    const email = `sms.guest.${digits}@guest.local`;

    const existingByEmail = await User.findOne({ email });
    if (existingByEmail) {
        if (existingByEmail.phone !== normalizedPhone) {
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
        logger.webhook(`Upgraded existing user ${logger.highlight(existingByEmail._id)} as guest for ${logger.highlight(normalizedPhone)}`);
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

    logger.webhook(`Created guest user ${logger.highlight(createdGuest._id)} for ${logger.highlight(normalizedPhone)}`);
    return createdGuest;
};

const buildRawSenderAlias = (rawSender) => {
    const value = String(rawSender || '').trim().toLowerCase();
    const compact = value.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
    return compact || 'unknown';
};

const ensureGuestUserForRawSender = async (rawSender) => {
    const senderValue = String(rawSender || '').trim() || 'unknown';
    const senderHash = crypto.createHash('sha1').update(senderValue.toLowerCase()).digest('hex').slice(0, 12);
    const alias = buildRawSenderAlias(senderValue);
    const email = `sms.sender.${senderHash}@guest.local`;

    let guest = await User.findOne({ email });
    if (!guest) {
        guest = await User.create({
            name: `Guest ${alias}`,
            email,
            oauth: true,
            provider: 'sms-gateway',
            roles: ['victim'],
            activeRole: 'victim',
            phone: null,
            isGuest: true,
        });

        logger.webhook(`Created guest user ${logger.highlight(guest._id)} for raw sender ${logger.highlight(senderValue)}`);
        return guest;
    }

    let changed = false;
    if (!guest.isGuest) {
        guest.isGuest = true;
        changed = true;
    }
    if (!Array.isArray(guest.roles) || !guest.roles.includes('victim')) {
        guest.roles = ['victim'];
        changed = true;
    }
    if (guest.activeRole !== 'victim') {
        guest.activeRole = 'victim';
        changed = true;
    }

    if (changed) {
        await guest.save();
    }

    logger.webhook(`Reusing guest user ${logger.highlight(guest._id)} for raw sender ${logger.highlight(senderValue)}`);
    return guest;
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

const extractRawWebhookSender = (payload = {}) => {
    const inner = payload?.payload && typeof payload.payload === 'object'
        ? payload.payload
        : payload;

    const raw = inner?.sender || inner?.phoneNumber || inner?.from || payload?.sender || payload?.from;
    const value = String(raw || '').trim();
    return value || null;
};

const normalizeSmsGateWebhookPayload = (payload = {}) => {
    const event = String(payload?.event || '').trim().toLowerCase();
    const inner = payload?.payload && typeof payload.payload === 'object'
        ? payload.payload
        : payload;

    const rawSender = extractRawWebhookSender(payload);
    const from = normalizePhone(rawSender);
    const text = compactMessage(inner.message || inner.text || payload.message || payload.text || payload.body || '');

    if (!text) {
        throw new AppError('SMS webhook payload requires non-empty text', StatusCodes.BAD_REQUEST, 'SMS_WEBHOOK_EMPTY_TEXT');
    }

    const sentStampIso = parseIsoToEpochMs(inner.sentAt || inner.receivedAt || inner.deliveredAt || inner.failedAt);
    const sentStampNum = Number(inner.sentStamp || payload.sentStamp);
    const receivedStampNum = Number(inner.receivedStamp || payload.receivedStamp);

    return {
        event: event || 'sms:received',
        rawSender,
        from,
        text,
        parsedReport: parseDcReportMessage(text),
        messageId: String(inner.messageId || '').trim() || null,
        recipient: normalizePhone(inner.recipient || inner.phoneNumber || payload.recipient || payload.phoneNumber),
        sentStamp: Number.isFinite(sentStampNum)
            ? Math.trunc(sentStampNum)
            : (sentStampIso || Date.now()),
        receivedStamp: Number.isFinite(receivedStampNum)
            ? Math.trunc(receivedStampNum)
            : (sentStampIso || Date.now()),
        sim: String(inner.simNumber || inner.sim || payload.sim || 'undetected').trim() || 'undetected',
        raw: payload,
    };
};

const parseGatewayPayload = (payload = {}) => {
    return normalizeSmsGateWebhookPayload(payload);
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
    const phoneCandidates = [normalizedPhone, `+${normalizedPhone}`, `+91${normalizedPhone}`, `91${normalizedPhone}`];
    const existingUser = await User.findOne({ phone: { $in: phoneCandidates } });
    if (existingUser) {
        logger.webhook(`Matched existing user ${logger.highlight(existingUser._id)} for ${logger.highlight(normalizedPhone)} guest=${logger.highlight(Boolean(existingUser.isGuest))}`);
        return existingUser;
    }

    return ensureGuestUserForPhone(normalizedPhone);
};

const ensureUserForInboundSender = async ({ normalizedPhone = null, rawSender = null }) => {
    if (normalizedPhone) {
        return ensureUserForPhone(normalizedPhone);
    }

    return ensureGuestUserForRawSender(rawSender);
};

const buildIncidentFromInboundSms = async ({ from, rawSender, text, parsedReport, sim, sentStamp, receivedStamp, raw }) => {
    const linkedUser = await ensureUserForInboundSender({ normalizedPhone: from, rawSender });
    const senderLabel = from || String(rawSender || '').trim() || 'unknown';

    const severity = inferSeverityFromText(parsedReport?.details || text);
    const typeLabel = parsedReport?.type === 'alert' ? 'Alert' : 'Incident';
    const sourceLabel = parsedReport?.fromLabel || linkedUser?.name || senderLabel;
    const refLabel = parsedReport?.reference ? ` (${parsedReport.reference})` : '';

    const title = `${typeLabel} SMS from ${sourceLabel}${refLabel}`.slice(0, 200);
    const description = [
        parsedReport?.details || text,
        '',
        `Sender: ${senderLabel}`,
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

const getSmsGateAuthHeaders = () => {
    const mode = String(SMS_GATE_AUTH_MODE || 'basic').trim().toLowerCase();
    if (mode === 'bearer' && smsGateBearerConfigured) {
        return {
            Authorization: `Bearer ${SMS_GATE_ACCESS_TOKEN}`,
        };
    }

    if (smsGateBasicConfigured) {
        return {
            Authorization: `Basic ${Buffer.from(`${SMS_GATE_USERNAME}:${SMS_GATE_PASSWORD}`).toString('base64')}`,
        };
    }

    return {};
};

const deliverThroughSmsGate = async ({ to, body, meta = null }) => {
    if (!smsGateConfigured) {
        return {
            status: 'simulated',
            providerMessageId: null,
            errorMessage: null,
            providerPayload: {
                reason: 'SMS_GATE_NOT_CONFIGURED',
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

    const gatewayTo = toSmsGatewayPhoneNumber(to);
    if (!gatewayTo) {
        return {
            status: 'failed',
            providerMessageId: null,
            errorMessage: 'Invalid recipient phone for SMS gateway',
            providerPayload: {
                reason: 'INVALID_RECIPIENT_PHONE',
            },
        };
    }

    const query = new URLSearchParams();
    if (toBoolean(SMS_GATE_SKIP_PHONE_VALIDATION)) {
        query.set('skipPhoneValidation', 'true');
    }
    if (SMS_GATE_DEVICE_ACTIVE_WITHIN_HOURS > 0) {
        query.set('deviceActiveWithin', String(SMS_GATE_DEVICE_ACTIVE_WITHIN_HOURS));
    }

    const endpoint = `${smsGateBaseUrl}/messages${query.toString() ? `?${query.toString()}` : ''}`;
    const payload = {
        textMessage: {
            text: body,
        },
        phoneNumbers: [gatewayTo],
        withDeliveryReport: true,
    };

    if (SMS_GATE_DEFAULT_DEVICE_ID) {
        payload.deviceId = SMS_GATE_DEFAULT_DEVICE_ID;
    }

    if (SMS_GATE_DEFAULT_SIM_NUMBER >= 1 && SMS_GATE_DEFAULT_SIM_NUMBER <= 3) {
        payload.simNumber = SMS_GATE_DEFAULT_SIM_NUMBER;
    }

    if (meta?.providerRequestId) {
        payload.id = String(meta.providerRequestId).slice(0, 36);
    }

    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutHandle = abortController
        ? setTimeout(() => abortController.abort(), 10000)
        : null;

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                ...getSmsGateAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: abortController?.signal,
        });

        const parsed = await response.json().catch(() => ({}));
        if (!response.ok) {
            return {
                status: 'failed',
                providerMessageId: null,
                errorMessage: parsed?.message || `SMS Gate send failed with status ${response.status}`,
                providerPayload: parsed,
            };
        }

        return {
            status: 'sent',
            providerMessageId: parsed?.id || null,
            errorMessage: null,
            providerPayload: parsed,
        };
    } catch (error) {
        return {
            status: 'failed',
            providerMessageId: null,
            errorMessage: error?.message || 'SMS Gate request failed',
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
    const fromValue = normalizedPhone || String(phone || '').trim() || null;
    const compact = compactMessage(message);

    if (!compact) return null;

    return SmsMessage.create({
        channel: 'sms',
        direction: 'inbound',
        kind,
        status,
        to: to || SMS_GATE_OUTBOUND_FROM || null,
        from: fromValue,
        userId: userId || null,
        incidentId: incidentId || null,
        message: compact,
        provider,
        meta,
    });
};

const processIncomingSmsWebhook = async ({ payload = {} }) => {
    const incoming = parseGatewayPayload(payload);
    const senderDisplay = incoming.from || incoming.rawSender || 'n/a';
    logger.webhook(
        `Inbound parsed sender=${logger.highlight(senderDisplay)} sim=${logger.highlight(incoming.sim)} sent=${logger.highlight(incoming.sentStamp)} text=${logger.highlight(previewMessage(incoming.text))}`
    );

    if (!incoming.from) {
        logger.warn(
            'webhook',
            `Inbound sender is non-standard. Creating incident using raw sender identity=${logger.highlight(incoming.rawSender || 'n/a')}`
        );
    }

    const senderDedupeValue = incoming.from || String(incoming.rawSender || '').trim() || 'unknown';

    const dedupeKey = buildInboundDedupeKey({
        from: senderDedupeValue,
        text: incoming.text,
        sentStamp: incoming.sentStamp,
    });

    const duplicate = await findRecentInboundDuplicate({
        from: senderDedupeValue,
        text: incoming.text,
        sentStamp: incoming.sentStamp,
        dedupeKey,
    });

    if (duplicate) {
        logger.warn(
            'webhook',
            `Duplicate inbound SMS key=${logger.highlight(dedupeKey)} incident=${logger.highlight(duplicate.incidentId || 'n/a')} record=${logger.highlight(duplicate._id)}`
        );
        return {
            duplicate: true,
            dedupeKey,
            incidentId: duplicate.incidentId || null,
            smsRecordId: duplicate._id,
        };
    }

    const { incident, linkedUser } = await buildIncidentFromInboundSms({
        ...incoming,
        rawSender: incoming.rawSender,
    });

    const smsRecord = await createInboundReportRecord({
        userId: linkedUser._id,
        incidentId: incident._id,
        phone: incoming.from || incoming.rawSender,
        message: incoming.text,
        provider: SMS_GATE_PROVIDER_NAME,
        meta: {
            source: 'sms-gate-webhook',
            dedupeKey,
            rawSender: incoming.rawSender || null,
            sentStamp: incoming.sentStamp,
            receivedStamp: incoming.receivedStamp,
            sim: incoming.sim,
            parsedReport: incoming.parsedReport || null,
            raw: incoming.raw,
        },
    });

    logger.success(
        'webhook',
        `Incident created id=${logger.highlight(incident._id)} user=${logger.highlight(linkedUser._id)} sender=${logger.highlight(senderDedupeValue)} severity=${logger.highlight(incident.severity)}`
    );

    return {
        duplicate: false,
        dedupeKey,
        incidentId: incident._id,
        linkedUserId: linkedUser._id,
        guestUserId: linkedUser.isGuest ? linkedUser._id : null,
        smsRecordId: smsRecord?._id || null,
        sender: incoming.from || incoming.rawSender || null,
    };
};

const mapStatusEventToMessageStatus = (event) => {
    if (event === 'sms:failed') return 'failed';
    if (event === 'sms:delivered') return 'delivered';
    if (event === 'sms:sent') return 'sent';
    return null;
};

const processSmsStatusWebhook = async ({ payload = {} }) => {
    const event = String(payload?.event || '').trim().toLowerCase();
    const eventPayload = payload?.payload && typeof payload.payload === 'object'
        ? payload.payload
        : payload;

    const providerMessageId = String(eventPayload?.messageId || '').trim();
    const mappedStatus = mapStatusEventToMessageStatus(event);
    if (!mappedStatus) {
        return {
            event,
            updated: false,
            reason: 'UNSUPPORTED_EVENT',
        };
    }

    const recipient = normalizePhone(eventPayload?.recipient || eventPayload?.phoneNumber);
    const providerName = SMS_GATE_PROVIDER_NAME;

    let record = null;
    if (providerMessageId) {
        record = await SmsMessage.findOne({
            direction: 'outbound',
            provider: providerName,
            providerMessageId,
        }).sort({ createdAt: -1 });
    }

    if (!record && recipient) {
        const recipientCandidates = [recipient, `+${recipient}`, `+91${recipient}`, `91${recipient}`];
        record = await SmsMessage.findOne({
            direction: 'outbound',
            provider: providerName,
            to: { $in: recipientCandidates },
        }).sort({ createdAt: -1 });
    }

    if (!record) {
        return {
            event,
            updated: false,
            reason: 'SMS_RECORD_NOT_FOUND',
            providerMessageId: providerMessageId || null,
        };
    }

    record.status = mappedStatus;
    if (mappedStatus === 'failed') {
        record.errorMessage = String(eventPayload?.reason || record.errorMessage || 'SMS delivery failed');
    }

    record.meta = {
        ...(record.meta || {}),
        statusEvent: {
            event,
            eventId: payload?.id || null,
            webhookId: payload?.webhookId || null,
            providerMessageId: providerMessageId || null,
            recipient: recipient || null,
            raw: payload,
            updatedAt: new Date().toISOString(),
        },
    };

    await record.save();

    return {
        event,
        updated: true,
        smsRecordId: record._id,
        providerMessageId: providerMessageId || record.providerMessageId || null,
        status: record.status,
    };
};

const processSmsGateWebhookEvent = async ({ payload = {}, headers = {}, rawBody = '' }) => {
    const signatureState = verifySmsGateWebhookSignature({ rawBody, headers });
    if (!signatureState.valid) {
        throw new AppError(
            `Invalid SMS webhook signature (${signatureState.reason})`,
            StatusCodes.UNAUTHORIZED,
            'SMS_WEBHOOK_SIGNATURE_INVALID'
        );
    }

    const event = String(payload?.event || '').trim().toLowerCase();
    if (!event || event === 'sms:received') {
        const inboundResult = await processIncomingSmsWebhook({ payload });
        return {
            type: 'inbound',
            event: event || 'sms:received',
            ...inboundResult,
        };
    }

    if (['sms:sent', 'sms:delivered', 'sms:failed'].includes(event)) {
        const statusResult = await processSmsStatusWebhook({ payload });
        return {
            type: 'status',
            ...statusResult,
        };
    }

    return {
        type: 'ignored',
        event,
        reason: 'EVENT_NOT_HANDLED',
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
        from: SMS_GATE_OUTBOUND_FROM || null,
        message: compact,
        userId: toUserId || null,
        incidentId: incidentId || null,
        provider: SMS_GATE_PROVIDER_NAME,
        meta,
    });

    const delivery = await deliverThroughSmsGate({
        to: normalizedPhone,
        body: compact,
        meta,
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
        logger.notify(`Simulated SMS send to ${logger.highlight(normalizedPhone)} text=${logger.highlight(previewMessage(compact))}`);
    }

    if (record.status === 'failed') {
        logger.error('notify', `SMS send failed to ${logger.highlight(normalizedPhone)}`, record.errorMessage || 'Unknown SMS send failure');
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

const buildIncidentEmailSubject = ({ kind, incident }) => {
    const incidentRef = toObjectIdString(incident?._id)?.slice(-6)?.toUpperCase() || 'N/A';

    if (kind === 'high-severity-alert') {
        return `High severity alert (${incidentRef})`;
    }

    if (kind === 'incident-received') {
        return `Incident received (${incidentRef})`;
    }

    if (kind === 'incident-resolved') {
        return `Incident resolved (${incidentRef})`;
    }

    return `Incident update (${incidentRef})`;
};

const buildEmptySummary = (extra = {}) => ({
    attempted: 0,
    sent: 0,
    simulated: 0,
    failed: 0,
    smsSkipped: 0,
    emailSent: 0,
    emailSimulated: 0,
    emailFailed: 0,
    emailSkipped: 0,
    ...extra,
});

const dispatchIncidentAudienceNotifications = async ({
    incident,
    users = [],
    smsRecipientIds = [],
    kind,
    message,
    emailSubject,
    meta = null,
}) => {
    if (!incident || !users.length) {
        return buildEmptySummary();
    }

    const smsRecipientIdSet = new Set(
        (smsRecipientIds || []).map((id) => toObjectIdString(id)).filter(Boolean)
    );

    const smsResults = await Promise.allSettled(users.map((user) => {
        const userId = toObjectIdString(user?._id);
        if (!userId || !smsRecipientIdSet.has(userId)) {
            return Promise.resolve({ status: 'skipped' });
        }

        const hasPhone = Boolean(normalizePhone(user.phone));
        if (!hasPhone) {
            return Promise.resolve({ status: 'skipped' });
        }

        return sendSmsAndPersist({
            toUserId: user._id,
            incidentId: incident._id,
            toPhone: user.phone,
            kind,
            message,
            meta,
        });
    }));

    const emailResults = await Promise.allSettled(users.map((user) => {
        const toEmail = String(user?.email || '').trim();
        if (!toEmail) {
            return Promise.resolve({ status: 'skipped' });
        }

        return sendEmail({
            to: toEmail,
            subject: emailSubject,
            text: message,
            meta: {
                channel: 'incident-update',
                incidentId: toObjectIdString(incident._id),
                userId: toObjectIdString(user._id),
                kind,
                ...(meta || {}),
            },
        });
    }));

    const summary = buildEmptySummary({ attempted: users.length });

    for (const result of smsResults) {
        if (result.status === 'rejected') {
            summary.failed += 1;
            continue;
        }

        const record = result.value;
        if (!record || record.status === 'skipped') {
            summary.smsSkipped += 1;
            continue;
        }

        if (record.status === 'sent' || record.status === 'delivered') summary.sent += 1;
        else if (record.status === 'simulated') summary.simulated += 1;
        else summary.failed += 1;
    }

    for (const result of emailResults) {
        if (result.status === 'rejected') {
            summary.emailFailed += 1;
            continue;
        }

        const emailRecord = result.value;
        if (!emailRecord || emailRecord.status === 'skipped') {
            summary.emailSkipped += 1;
            continue;
        }

        if (emailRecord.status === 'sent') summary.emailSent += 1;
        else if (emailRecord.status === 'simulated') summary.emailSimulated += 1;
        else summary.emailFailed += 1;
    }

    return summary;
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

    const emailSubject = buildIncidentEmailSubject({ kind, incident });

    const smsResults = await Promise.allSettled(victims.map((victim) => {
        const hasPhone = Boolean(normalizePhone(victim.phone));
        if (!hasPhone) {
            return Promise.resolve({ status: 'skipped' });
        }

        return sendSmsAndPersist({
            toUserId: victim._id,
            incidentId: incident._id,
            toPhone: victim.phone,
            kind,
            message,
            meta,
        });
    }));

    const emailResults = await Promise.allSettled(victims.map((victim) => {
        const toEmail = String(victim.email || '').trim();
        if (!toEmail) {
            return Promise.resolve({ status: 'skipped' });
        }

        return sendEmail({
            to: toEmail,
            subject: emailSubject,
            text: message,
            meta: {
                channel: 'incident-update',
                incidentId: toObjectIdString(incident._id),
                userId: toObjectIdString(victim._id),
                kind,
            },
        });
    }));

    const summary = {
        attempted: victims.length,
        sent: 0,
        simulated: 0,
        failed: 0,
        smsSkipped: 0,
        emailSent: 0,
        emailSimulated: 0,
        emailFailed: 0,
        emailSkipped: 0,
    };

    for (const result of smsResults) {
        if (result.status === 'rejected') {
            summary.failed += 1;
            continue;
        }

        const record = result.value;
        if (!record || record.status === 'skipped') {
            summary.smsSkipped += 1;
            continue;
        }

        if (record.status === 'sent' || record.status === 'delivered') summary.sent += 1;
        else if (record.status === 'simulated') summary.simulated += 1;
        else summary.failed += 1;
    }

    for (const result of emailResults) {
        if (result.status === 'rejected') {
            summary.emailFailed += 1;
            continue;
        }

        const emailRecord = result.value;
        if (!emailRecord || emailRecord.status === 'skipped') {
            summary.emailSkipped += 1;
            continue;
        }

        if (emailRecord.status === 'sent') summary.emailSent += 1;
        else if (emailRecord.status === 'simulated') summary.emailSimulated += 1;
        else summary.emailFailed += 1;
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

const notifyAccountCreated = async ({ userId }) => {
    const user = userId ? await User.findById(userId).select('_id name email phone').lean() : null;
    if (!user?._id) {
        return buildEmptySummary({ reason: 'USER_NOT_FOUND' });
    }

    const message = compactMessage('Welcome to Disaster Connect. Your account has been created successfully.');
    const subject = 'Welcome to Disaster Connect';

    const smsPromise = normalizePhone(user.phone)
        ? sendSmsAndPersist({
            toUserId: user._id,
            incidentId: null,
            toPhone: user.phone,
            kind: 'custom',
            message,
            meta: { trigger: 'account-created' },
        })
        : Promise.resolve({ status: 'skipped' });

    const emailPromise = String(user.email || '').trim()
        ? sendEmail({
            to: user.email,
            subject,
            text: message,
            meta: {
                channel: 'account-created',
                userId: toObjectIdString(user._id),
            },
        })
        : Promise.resolve({ status: 'skipped' });

    const [smsResult, emailResult] = await Promise.allSettled([smsPromise, emailPromise]);
    const summary = buildEmptySummary({ attempted: 1 });

    const smsRecord = smsResult.status === 'fulfilled' ? smsResult.value : null;
    if (!smsRecord || smsRecord.status === 'skipped') summary.smsSkipped += 1;
    else if (smsRecord.status === 'sent' || smsRecord.status === 'delivered') summary.sent += 1;
    else if (smsRecord.status === 'simulated') summary.simulated += 1;
    else summary.failed += 1;

    const emailRecord = emailResult.status === 'fulfilled' ? emailResult.value : null;
    if (!emailRecord || emailRecord.status === 'skipped') summary.emailSkipped += 1;
    else if (emailRecord.status === 'sent') summary.emailSent += 1;
    else if (emailRecord.status === 'simulated') summary.emailSimulated += 1;
    else summary.emailFailed += 1;

    return summary;
};

const notifyIncidentCreated = async ({ incidentId }) => {
    const incident = await Incident.findById(incidentId).select('_id title severity victims volunteers admins');
    if (!incident) {
        return buildEmptySummary({ reason: 'INCIDENT_NOT_FOUND' });
    }

    const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    const level = severityOrder[String(incident.severity || 'low').toLowerCase()] || 1;
    if (level < severityOrder.medium) {
        return buildEmptySummary({ reason: 'SEVERITY_BELOW_MEDIUM' });
    }

    const victimIds = (incident.victims || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const volunteerIds = (incident.volunteers || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const recipientIds = [...new Set([...victimIds, ...volunteerIds])];
    if (!recipientIds.length) {
        return buildEmptySummary({ reason: 'NO_RECIPIENTS' });
    }

    const users = await User.find({ _id: { $in: recipientIds } }).select('_id name email phone').lean();
    const message = buildIncidentMessage({ kind: 'incident-received', incident });
    const emailSubject = buildIncidentEmailSubject({ kind: 'incident-received', incident });

    return dispatchIncidentAudienceNotifications({
        incident,
        users,
        smsRecipientIds: victimIds,
        kind: 'incident-received',
        message,
        emailSubject,
        meta: { trigger: 'incident-created' },
    });
};

const notifyVolunteerAssignedParticipants = async ({ incidentId, volunteerName = null }) => {
    const incident = await Incident.findById(incidentId).select('_id title severity victims volunteers admins');
    if (!incident) {
        return buildEmptySummary({ reason: 'INCIDENT_NOT_FOUND' });
    }

    const victimIds = (incident.victims || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const volunteerIds = (incident.volunteers || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const adminIds = (incident.admins || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const recipientIds = [...new Set([...victimIds, ...volunteerIds, ...adminIds])];
    if (!recipientIds.length) {
        return buildEmptySummary({ reason: 'NO_RECIPIENTS' });
    }

    const users = await User.find({ _id: { $in: recipientIds } }).select('_id name email phone').lean();
    const message = buildIncidentMessage({ kind: 'volunteer-assigned', incident, actorName: volunteerName });
    const emailSubject = buildIncidentEmailSubject({ kind: 'volunteer-assigned', incident });

    return dispatchIncidentAudienceNotifications({
        incident,
        users,
        smsRecipientIds: victimIds,
        kind: 'volunteer-assigned',
        message,
        emailSubject,
        meta: { trigger: 'volunteer-assigned' },
    });
};

const notifyQuickAlertParticipants = async ({
    incidentId,
    alertTitle = null,
    alertMessage = null,
    severity = null,
}) => {
    const incident = await Incident.findById(incidentId).select('_id title severity victims volunteers admins');
    if (!incident) {
        return buildEmptySummary({ reason: 'INCIDENT_NOT_FOUND' });
    }

    const victimIds = (incident.victims || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const volunteerIds = (incident.volunteers || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const adminIds = (incident.admins || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const recipientIds = [...new Set([...victimIds, ...volunteerIds, ...adminIds])];
    if (!recipientIds.length) {
        return buildEmptySummary({ reason: 'NO_RECIPIENTS' });
    }

    const users = await User.find({ _id: { $in: recipientIds } }).select('_id name email phone').lean();
    const incidentRef = toObjectIdString(incident?._id)?.slice(-6)?.toUpperCase() || 'N/A';
    const label = String(alertTitle || 'Quick Alert').trim();
    const details = String(alertMessage || 'Check incident updates immediately.').trim();
    const level = String(severity || incident?.severity || '').trim().toUpperCase();
    const message = compactMessage(`Quick alert (${incidentRef})${level ? ` [${level}]` : ''}: ${label} - ${details}`);
    const emailSubject = `Quick alert (${incidentRef})`;

    return dispatchIncidentAudienceNotifications({
        incident,
        users,
        smsRecipientIds: victimIds,
        kind: 'high-severity-alert',
        message,
        emailSubject,
        meta: { trigger: 'quick-alert' },
    });
};

const notifyIncidentResolvedParticipants = async ({
    incidentId,
    participantIds = [],
    victimIds = [],
}) => {
    const incident = await Incident.findById(incidentId).select('_id title severity victims volunteers admins');
    if (!incident) {
        return buildEmptySummary({ reason: 'INCIDENT_NOT_FOUND' });
    }

    const derivedParticipantIds = [
        ...(incident.victims || []).map((id) => toObjectIdString(id)),
        ...(incident.volunteers || []).map((id) => toObjectIdString(id)),
        ...(incident.admins || []).map((id) => toObjectIdString(id)),
    ].filter(Boolean);

    const recipients = [...new Set([...(participantIds || []), ...derivedParticipantIds])].filter(Boolean);
    if (!recipients.length) {
        return buildEmptySummary({ reason: 'NO_RECIPIENTS' });
    }

    const resolvedVictimIds = [...new Set(
        [
            ...(victimIds || []),
            ...(incident.victims || []).map((id) => toObjectIdString(id)),
        ]
    )].filter(Boolean);

    const users = await User.find({ _id: { $in: recipients } }).select('_id name email phone').lean();
    const message = buildIncidentMessage({ kind: 'incident-resolved', incident });
    const emailSubject = buildIncidentEmailSubject({ kind: 'incident-resolved', incident });

    return dispatchIncidentAudienceNotifications({
        incident,
        users,
        smsRecipientIds: resolvedVictimIds,
        kind: 'incident-resolved',
        message,
        emailSubject,
        meta: { trigger: 'incident-resolved' },
    });
};

const notifyVolunteerJoinedParticipants = async ({ incidentId, volunteerName = null }) => {
    const incident = await Incident.findById(incidentId).select('_id title severity victims volunteers admins');
    if (!incident) {
        return buildEmptySummary({ reason: 'INCIDENT_NOT_FOUND' });
    }

    const victimIds = (incident.victims || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const volunteerIds = (incident.volunteers || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const adminIds = (incident.admins || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const recipientIds = [...new Set([...victimIds, ...volunteerIds, ...adminIds])];
    if (!recipientIds.length) {
        return buildEmptySummary({ reason: 'NO_RECIPIENTS' });
    }

    const users = await User.find({ _id: { $in: recipientIds } }).select('_id name email phone').lean();
    const incidentRef = toObjectIdString(incident?._id)?.slice(-6)?.toUpperCase() || 'N/A';
    const nameSuffix = volunteerName ? ` ${volunteerName}` : '';
    const message = compactMessage(`Update (${incidentRef}): Volunteer${nameSuffix} joined the incident.`);

    return dispatchIncidentAudienceNotifications({
        incident,
        users,
        smsRecipientIds: victimIds,
        kind: 'custom',
        message,
        emailSubject: `Volunteer joined (${incidentRef})`,
        meta: { trigger: 'volunteer-joined' },
    });
};

const notifyVolunteerLeftParticipants = async ({ incidentId, volunteerName = null }) => {
    const incident = await Incident.findById(incidentId).select('_id title severity victims volunteers admins');
    if (!incident) {
        return buildEmptySummary({ reason: 'INCIDENT_NOT_FOUND' });
    }

    const victimIds = (incident.victims || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const volunteerIds = (incident.volunteers || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const adminIds = (incident.admins || []).map((id) => toObjectIdString(id)).filter(Boolean);
    const recipientIds = [...new Set([...victimIds, ...volunteerIds, ...adminIds])];
    if (!recipientIds.length) {
        return buildEmptySummary({ reason: 'NO_RECIPIENTS' });
    }

    const users = await User.find({ _id: { $in: recipientIds } }).select('_id name email phone').lean();
    const incidentRef = toObjectIdString(incident?._id)?.slice(-6)?.toUpperCase() || 'N/A';
    const nameSuffix = volunteerName ? ` ${volunteerName}` : '';
    const message = compactMessage(`Update (${incidentRef}): Volunteer${nameSuffix} left the incident.`);

    return dispatchIncidentAudienceNotifications({
        incident,
        users,
        smsRecipientIds: victimIds,
        kind: 'custom',
        message,
        emailSubject: `Volunteer left (${incidentRef})`,
        meta: { trigger: 'volunteer-left' },
    });
};

const notifyIncidentUnassignedParticipants = async ({
    incidentId,
    targetUserId,
    actorUserId = null,
}) => {
    const incident = await Incident.findById(incidentId).select('_id title severity victims volunteers admins');
    if (!incident) {
        return buildEmptySummary({ reason: 'INCIDENT_NOT_FOUND' });
    }

    const participantIds = [
        ...(incident.victims || []).map((id) => toObjectIdString(id)),
        ...(incident.volunteers || []).map((id) => toObjectIdString(id)),
        ...(incident.admins || []).map((id) => toObjectIdString(id)),
    ];

    const recipientIds = [...new Set([
        ...participantIds,
        toObjectIdString(targetUserId),
        toObjectIdString(actorUserId),
    ].filter(Boolean))];

    if (!recipientIds.length) {
        return buildEmptySummary({ reason: 'NO_RECIPIENTS' });
    }

    const users = await User.find({ _id: { $in: recipientIds } }).select('_id name email phone').lean();
    const incidentRef = toObjectIdString(incident?._id)?.slice(-6)?.toUpperCase() || 'N/A';
    const message = compactMessage(`Update (${incidentRef}): A participant has been unassigned from the incident.`);

    return dispatchIncidentAudienceNotifications({
        incident,
        users,
        smsRecipientIds: [],
        kind: 'custom',
        message,
        emailSubject: `Participant unassigned (${incidentRef})`,
        meta: { trigger: 'participant-unassigned' },
    });
};

const notifyAdminAudit = async ({ action, details, meta = null }) => {
    const normalizedAction = String(action || 'admin-action').trim() || 'admin-action';
    const message = compactMessage(String(details || 'An admin action was performed.'));

    const admins = await User.find({
        $or: [
            { activeRole: 'admin' },
            { roles: 'admin' },
        ],
    }).select('_id email').lean();

    if (!admins.length) {
        return buildEmptySummary({ reason: 'NO_ADMINS' });
    }

    const emailResults = await Promise.allSettled(admins.map((admin) => {
        const toEmail = String(admin.email || '').trim();
        if (!toEmail) {
            return Promise.resolve({ status: 'skipped' });
        }

        return sendEmail({
            to: toEmail,
            subject: `Admin audit: ${normalizedAction}`,
            text: message,
            meta: {
                channel: 'admin-audit',
                action: normalizedAction,
                adminId: toObjectIdString(admin._id),
                ...(meta || {}),
            },
        });
    }));

    const summary = buildEmptySummary({ attempted: admins.length, smsSkipped: admins.length });
    for (const result of emailResults) {
        if (result.status === 'rejected') {
            summary.emailFailed += 1;
            continue;
        }

        const emailRecord = result.value;
        if (!emailRecord || emailRecord.status === 'skipped') {
            summary.emailSkipped += 1;
            continue;
        }

        if (emailRecord.status === 'sent') summary.emailSent += 1;
        else if (emailRecord.status === 'simulated') summary.emailSimulated += 1;
        else summary.emailFailed += 1;
    }

    return summary;
};

const listIncidentSmsLogs = async ({ incidentId, limit = 100 }) => SmsMessage.find({ incidentId })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit) || 100, 200)))
    .lean();

const sendSmsTestMessage = async ({ toPhone = null, message = null, requestedBy = null }) => {
    const targetPhone = normalizePhone(toPhone || SMS_TEST_TARGET_PHONE);
    if (!targetPhone) {
        throw new AppError(
            'A valid 10-digit Indian mobile number is required for SMS test',
            StatusCodes.BAD_REQUEST,
            'SMS_TEST_PHONE_REQUIRED'
        );
    }

    const text = compactMessage(message || 'Hi hello, SMS test working from Disaster Connect.');
    if (!text) {
        throw new AppError('SMS test message cannot be empty', StatusCodes.BAD_REQUEST, 'SMS_TEST_MESSAGE_REQUIRED');
    }

    const recipientCandidates = [targetPhone, `+${targetPhone}`, `+91${targetPhone}`, `91${targetPhone}`];
    const recipientUser = await User.findOne({ phone: { $in: recipientCandidates } }).select('_id').lean();

    const record = await sendSmsAndPersist({
        toUserId: recipientUser?._id || null,
        incidentId: null,
        toPhone: targetPhone,
        kind: 'custom',
        message: text,
        meta: {
            trigger: 'manual-sms-test',
            requestedBy: toObjectIdString(requestedBy),
            targetPhone,
        },
    });

    if (!record) {
        throw new AppError('Failed to queue SMS test message', StatusCodes.INTERNAL_SERVER_ERROR, 'SMS_TEST_SEND_FAILED');
    }

    return {
        smsRecordId: record._id,
        status: record.status,
        to: record.to,
        from: record.from,
        message: record.message,
        errorMessage: record.errorMessage || null,
        defaultTargetPhone: normalizePhone(SMS_TEST_TARGET_PHONE) || null,
    };
};

module.exports = {
    normalizePhone,
    logSmsStartupReadiness,
    createInboundReportRecord,
    processIncomingSmsWebhook,
    processSmsGateWebhookEvent,
    sendIncidentUpdateToVictims,
    notifyIncidentReceived,
    notifyIncidentWorking,
    notifyVolunteerAssigned,
    notifyIncidentResolved,
    notifyHighSeverityAlert,
    notifyAccountCreated,
    notifyIncidentCreated,
    notifyVolunteerAssignedParticipants,
    notifyQuickAlertParticipants,
    notifyIncidentResolvedParticipants,
    notifyVolunteerJoinedParticipants,
    notifyVolunteerLeftParticipants,
    notifyIncidentUnassignedParticipants,
    notifyAdminAudit,
    sendSmsTestMessage,
    listIncidentSmsLogs,
};
