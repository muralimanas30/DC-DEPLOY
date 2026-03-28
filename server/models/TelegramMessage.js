const mongoose = require('mongoose');

const telegramMessageSchema = new mongoose.Schema(
    {
        channel: {
            type: String,
            enum: ['telegram'],
            default: 'telegram',
        },
        direction: {
            type: String,
            enum: ['inbound', 'outbound'],
            required: true,
        },
        kind: {
            type: String,
            enum: [
                'incident-report',
                'incident-received',
                'incident-working',
                'volunteer-assigned',
                'incident-resolved',
                'high-severity-alert',
                'custom',
            ],
            default: 'custom',
        },
        status: {
            type: String,
            enum: ['queued', 'received', 'sent', 'failed', 'simulated'],
            default: 'queued',
            index: true,
        },
        to: {
            type: String,
            trim: true,
            default: null,
        },
        from: {
            type: String,
            trim: true,
            default: null,
        },
        recipientTelegramId: {
            type: String,
            trim: true,
            default: null,
            index: true,
        },
        recipientTelegramUsername: {
            type: String,
            trim: true,
            default: null,
            index: true,
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 4096,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            index: true,
            default: null,
        },
        incidentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Incident',
            index: true,
            default: null,
        },
        provider: {
            type: String,
            default: 'telegram-bot-api',
        },
        providerMessageId: {
            type: String,
            default: null,
        },
        errorMessage: {
            type: String,
            default: null,
        },
        meta: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

telegramMessageSchema.index({ incidentId: 1, createdAt: -1 });
telegramMessageSchema.index({ userId: 1, status: 1, createdAt: -1 });
telegramMessageSchema.index({ direction: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.TelegramMessage ?? mongoose.model('TelegramMessage', telegramMessageSchema);