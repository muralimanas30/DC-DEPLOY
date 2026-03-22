const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },
        category: {
            type: String,
            default: "general",
            trim: true,
        },
        severity: {
            type: String,
            enum: ["low", "medium", "high", "critical"],
            default: "medium",
        },
        status: {
            type: String,
            enum: ["open", "active", "pending-victim-consensus", "resolved", "closed"],
            default: "open",
            index: true,
        },
        creatorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        creatorRole: {
            type: String,
            enum: ["victim", "volunteer", "admin"],
            default: "victim",
        },
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number],
                default: [0, 0],
            },
        },
        victimCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        volunteerCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        adminCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        activeParticipantCount: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
    }
);

incidentSchema.index({ location: "2dsphere" });
incidentSchema.index({ createdAt: -1 });

module.exports = mongoose.models.Incident ?? mongoose.model("Incident", incidentSchema);
