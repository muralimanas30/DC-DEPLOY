const nodemailer = require('nodemailer');
const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_SECURE,
    SMTP_USER,
    SMTP_PASS,
    EMAIL_FROM,
    NODE_ENV,
} = require('../../config');

const toBoolean = (value) => {
    if (typeof value === 'boolean') return value;
    return String(value || '').trim().toLowerCase() === 'true';
};

const smtpConfigured = Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS);
let transporter = null;

const getTransporter = () => {
    if (!smtpConfigured) {
        return null;
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: Number(SMTP_PORT) || 587,
            secure: toBoolean(SMTP_SECURE),
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            },
        });
    }

    return transporter;
};

const sendEmail = async ({
    to,
    subject,
    text,
    html = null,
    meta = null,
}) => {
    const recipient = String(to || '').trim().toLowerCase();
    const emailSubject = String(subject || '').trim();
    const emailText = String(text || '').trim();

    if (!recipient || !emailSubject || !emailText) {
        return {
            status: 'skipped',
            providerMessageId: null,
            errorMessage: null,
            providerPayload: {
                reason: 'MISSING_EMAIL_FIELDS',
                meta,
            },
        };
    }

    const transport = getTransporter();
    if (!transport) {
        return {
            status: 'simulated',
            providerMessageId: null,
            errorMessage: null,
            providerPayload: {
                reason: 'SMTP_NOT_CONFIGURED',
                environment: NODE_ENV,
                to: recipient,
                subject: emailSubject,
                meta,
            },
        };
    }

    try {
        const info = await transport.sendMail({
            from: EMAIL_FROM || SMTP_USER,
            to: recipient,
            subject: emailSubject.slice(0, 200),
            text: emailText.slice(0, 5000),
            ...(html ? { html } : {}),
        });

        return {
            status: 'sent',
            providerMessageId: info?.messageId || null,
            errorMessage: null,
            providerPayload: {
                accepted: info?.accepted || [],
                rejected: info?.rejected || [],
                response: info?.response || null,
                envelope: info?.envelope || null,
                environment: NODE_ENV,
                meta,
            },
        };
    } catch (error) {
        return {
            status: 'failed',
            providerMessageId: null,
            errorMessage: error?.message || 'Email send failed',
            providerPayload: {
                errorName: error?.name || 'Error',
                environment: NODE_ENV,
                meta,
            },
        };
    }
};

module.exports = {
    sendEmail,
};
