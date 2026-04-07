const mongoose = require('mongoose');

const smsMessageSchema = new mongoose.Schema(
    {
        channel: {
            type: String,
            enum: ['sms'],
            default: 'sms',
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
            enum: ['queued', 'received', 'sent', 'delivered', 'failed', 'simulated'],
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
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
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
            default: 'sms-gate',
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

smsMessageSchema.index({ incidentId: 1, createdAt: -1 });
smsMessageSchema.index({ userId: 1, status: 1, createdAt: -1 });
smsMessageSchema.index({ direction: 1, status: 1, createdAt: -1 });

module.exports = mongoose.models.SmsMessage ?? mongoose.model('SmsMessage', smsMessageSchema);
