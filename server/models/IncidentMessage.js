const mongoose = require("mongoose");

const incidentMessageSchema = new mongoose.Schema(
    {
        incidentId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Incident",
            required: true,
            index: true,
        },
        senderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        senderName: {
            type: String,
            trim: true,
            required: true,
            maxlength: 120,
        },
        senderRole: {
            type: String,
            enum: ["victim", "volunteer", "admin"],
            required: true,
        },
        type: {
            type: String,
            enum: ["text", "alert"],
            default: "text",
            index: true,
        },
        body: {
            type: String,
            trim: true,
            required: true,
            maxlength: 1200,
        },
        alertType: {
            type: String,
            default: null,
            trim: true,
        },
        alertTitle: {
            type: String,
            default: null,
            trim: true,
            maxlength: 120,
        },
        severity: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            default: "medium",
        },
    },
    {
        timestamps: true,
    }
);

incidentMessageSchema.index({ incidentId: 1, createdAt: -1 });

module.exports = mongoose.models.IncidentMessage || mongoose.model("IncidentMessage", incidentMessageSchema);
