const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
    },

    email: {
        type: String,
        unique: true,
        lowercase: true,
        index: true,
        required: true,
    },

    password: {
        type: String,
        required: function () {
            // Password required ONLY for non-OAuth users
            return !this.oauth;
        },
        // select: false, // never return password by default
    },

    image: String,

    roles: {
        type: [String],
        enum: ["victim", "volunteer", "admin"],
        default: ["victim"],
    },

    activeRole: {
        type: String,
        enum: ["victim", "volunteer", "admin"],
        default: "victim",
    },

    phone: String,

    skills: {
        type: [String],
        default: [],
    },

    currentLocation: {
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

    isOnline: {
        type: Boolean,
        default: false,
    },

    assignedIncident: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Incident",
        default: null,
    },

    lastSeen:{
        type:Date,
        default: Date.now
    },

    oauth: {
        type: Boolean,
        default: false,
    },
    provider: {
        type:String,
        default:"credentials",
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
});

/* ===========================
   Indexes
   =========================== */
userSchema.index({ currentLocation: "2dsphere" });

/* ===========================
   Password Hashing Middleware
   =========================== */
userSchema.pre("save", async function (next) {
    try {
        if (!this.isModified("password")) return next();
        this.password = await bcrypt.hash(this.password, 10);
        next();
    } catch (err) {
        next(err);
    }
});


/* ===========================
   Password Comparison Method
   =========================== */
userSchema.methods.isMatch = async function (plainPassword) {
    return bcrypt.compare(plainPassword, this.password);
};

module.exports = mongoose.Model.User ?? mongoose.model("User", userSchema);
