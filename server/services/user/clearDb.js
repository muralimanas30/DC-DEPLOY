const mongoose = require('mongoose');
const { StatusCodes } = require('http-status-codes');
const { AppError } = require('../../errorHandler/errorHandler');
const User = require('../../models/User');
const Incident = require('../../models/Incident');
const IncidentMessage = require('../../models/IncidentMessage');
const SmsMessage = require('../../models/SmsMessage');
const TelegramMessage = require('../../models/TelegramMessage');
const { sendSuccess } = require('../../utils/response');

const CONFIRMATION_TEXT = 'CLEAR_DB';

const isAdmin = (user) => {
    const roles = Array.isArray(user?.roles) ? user.roles : [];
    return user?.activeRole === 'admin' || roles.includes('admin');
};

const clearDatabase = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }

        if (!isAdmin(req.user)) {
            throw new AppError('Only admins can clear the database', StatusCodes.FORBIDDEN, 'FORBIDDEN');
        }

        const confirmation = String(req.body?.confirmation || '').trim().toUpperCase();
        if (confirmation !== CONFIRMATION_TEXT) {
            throw new AppError(
                `Confirmation must be '${CONFIRMATION_TEXT}'`,
                StatusCodes.BAD_REQUEST,
                'CLEAR_DB_CONFIRMATION_REQUIRED'
            );
        }

        const session = await mongoose.startSession();
        let summary = null;

        try {
            await session.withTransaction(async () => {
                const adminUsers = await User.find({ roles: 'admin' }).select('_id').session(session);
                const preservedAdminIds = adminUsers.map((user) => user._id);

                const [
                    incidentResult,
                    incidentMessageResult,
                    smsResult,
                    telegramResult,
                    deletedUsersResult,
                    resetAdminsResult,
                ] = await Promise.all([
                    Incident.deleteMany({}, { session }),
                    IncidentMessage.deleteMany({}, { session }),
                    SmsMessage.deleteMany({}, { session }),
                    TelegramMessage.deleteMany({}, { session }),
                    User.deleteMany({ _id: { $nin: preservedAdminIds } }, { session }),
                    User.updateMany(
                        { _id: { $in: preservedAdminIds } },
                        {
                            $set: {
                                assignedIncident: null,
                                isOnline: false,
                                currentLocation: { type: 'Point', coordinates: [0, 0] },
                                lastSeen: new Date(),
                            },
                        },
                        { session }
                    ),
                ]);

                summary = {
                    incidentsCleared: incidentResult?.deletedCount || 0,
                    incidentMessagesCleared: incidentMessageResult?.deletedCount || 0,
                    smsMessagesCleared: smsResult?.deletedCount || 0,
                    telegramMessagesCleared: telegramResult?.deletedCount || 0,
                    usersDeleted: deletedUsersResult?.deletedCount || 0,
                    adminsPreserved: preservedAdminIds.length,
                    adminsReset: resetAdminsResult?.modifiedCount || 0,
                };
            });
        } finally {
            session.endSession();
        }

        console.warn('[ADMIN_CLEAR_DB] Database cleared by admin', {
            byUserId: req.userId || req.user?.id || req.user?._id || null,
            summary,
        });

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: 'Database cleared. Admin users were preserved.',
            data: summary,
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { clearDatabase };