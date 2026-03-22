const mongoose = require('mongoose');
const User = require('../models/User');
const Incident = require('../models/Incident');
const { CustomError } = require('../errorHandler/errorHandler');
const { sendWelcomeEmail } = require('./emailService'); // <-- import email service

// Register a new user
const register = async (userData) => {
    // Remove username if present
    if ('username' in userData) delete userData.username;
    const existing = await User.findOne({ email: userData.email });
    if (existing) throw new CustomError('Email already registered', 400);
    const user = new User(userData);
    await user.save();

    // Send welcome email after successful registration
    sendWelcomeEmail(user).then(() => {
        console.log(`[UserService] Welcome email sent to ${user.email}`);
    }).catch(err => {
        console.error(`[UserService] Failed to send welcome email to ${user.email}: ${err.message}`);
    });

    return user;
};

// Login user
const login = async (email, password) => {
    const user = await User.findOne({ email });
    if (!user) throw new CustomError('Email not found', 404);
    const isMatch = await user.comparePassword(password);
    if (!isMatch) throw new CustomError('Invalid credentials', 401);
    const token = user.generateJWT();
    return { user, token };
};

function toObjectId(id) {
    if (id instanceof mongoose.Types.ObjectId) return id;
    if (typeof id === 'string' && mongoose.Types.ObjectId.isValid(id)) {
        return new mongoose.Types.ObjectId(id);
    }
    throw new CustomError('Invalid ObjectId', 400);
}

// Get user by ID
const getUser = async (id) => {
    const objectId = toObjectId(id);
    const user = await User.findById(objectId);
    if (!user) throw new CustomError('User not found.', 404);
    return user;
};

// Update user by ID
const updateUser = async (id, updateData) => {
    const objectId = toObjectId(id);
    const user = await User.findById(objectId);
    if (!user) throw new CustomError('User not found.', 404);

    // Prevent role change if assigned to any unresolved incident (victim or volunteer)
    if (updateData.role && updateData.role !== user.role) {
        const assignedIncident = await Incident.findOne({
            $or: [
                { victims: objectId },
                { volunteers: objectId }
            ],
            status: { $ne: 'resolved' }
        });
        if (assignedIncident) {
            throw new CustomError('Cannot change role while assigned to any incident.', 400);
        }
    }

    // Only update allowed fields (add assignedIncident)
    const allowed = ['name', 'email', 'role', 'phone', 'currentLocation', 'assignedIncident'];
    allowed.forEach(field => {
        if (updateData[field] !== undefined) {
            user[field] = updateData[field];
        }
    });
    await user.save();
    return user;
};

// When an incident is resolved, clear assignedIncident for all victims and volunteers
const clearAssignedIncidentForUsers = async (incident) => {
    const userIds = [
        ...incident.victims.map(v => v.toString()),
        ...incident.volunteers.map(v => v.toString())
    ];
    if (userIds.length > 0) {
        await User.updateMany(
            { _id: { $in: userIds } },
            { $set: { assignedIncident: null } }
        );
    }
};

// Delete user by ID
const deleteUser = async (id) => {
    const objectId = toObjectId(id);

    // Check if user is assigned to any open/in-progress incidents
    const assignedIncident = await Incident.findOne({
        $or: [
            { victims: objectId },
            { volunteers: objectId }
        ],
        status: { $in: ['open', 'in_progress'] }
    });
    if (assignedIncident) {
        throw new CustomError('Cannot delete user assigned to an active incident.', 400);
    }

    const user = await User.findByIdAndDelete(objectId);
    if (!user) throw new CustomError('User not found.', 404);
    return user;
};

// Get all users
const getAllUsers = async (page = 1, limit = 10) => {
    const skip = (page - 1) * limit;
    const [items, totalItems] = await Promise.all([
        User.find().skip(skip).limit(limit),
        User.countDocuments()
    ]);
    return {
        items,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
        totalItems
    };
};

// Delete all users
const deleteAllUsers = async () => {
    await User.deleteMany();
};

// Accept gathering invitation
const acceptGatheringInvitation = async (userId, invitationId) => {
    // Example: Mark invitation as accepted for user (expand as needed)
    // This is a stub; actual logic depends on how invitations are stored
    return { userId, invitationId, accepted: true };
};

// Get incident history
const getIncidentHistory = async (userId, page = 1, limit = 10) => {
    const objectId = toObjectId(userId);
    const query = {
        $or: [
            { victims: objectId },
            { volunteers: objectId }
        ]
    };
    const skip = (page - 1) * limit;
    const [items, totalItems] = await Promise.all([
        Incident.find(query).skip(skip).limit(limit),
        Incident.countDocuments(query)
    ]);
    return {
        items,
        page,
        limit,
        totalPages: Math.ceil(totalItems / limit),
        totalItems
    };
};

// Get the unresolved incident assigned to the user (as victim or volunteer)
const getAssignedIncident = async (userId) => {
    const objectId = toObjectId(userId);
    // Find one unresolved incident where user is a victim or volunteer
    const incident = await Incident.findOne({
        $or: [
            { victims: objectId },
            { volunteers: objectId }
        ],
        status: { $ne: 'resolved' }
    })
    .populate('victims')
    .populate('volunteers')
    .populate('resources');
    return incident;
};

// assignedIncident is set/cleared in incidentService and userService as needed

module.exports = {
    register,
    login,
    getUser,
    updateUser,
    deleteUser,
    getAllUsers,
    deleteAllUsers,
    acceptGatheringInvitation,
    getIncidentHistory,
    getAssignedIncident,
    clearAssignedIncidentForUsers,
};