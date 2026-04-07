const { StatusCodes } = require('http-status-codes');
const { AppError } = require('../../errorHandler/errorHandler');
const User = require('../../models/User');
const Incident = require('../../models/Incident');
const IncidentMessage = require('../../models/IncidentMessage');
const SmsMessage = require('../../models/SmsMessage');
const { sendSuccess } = require('../../utils/response');
const { notifyAdminAudit } = require('../sms');
const { logger } = require('../../utils/logger');

const CONFIRMATION_TEXT = 'CLEAR_DB';

const isObjectIdString = (value) => /^[a-f\d]{24}$/i.test(String(value || '').trim());

const resolveRequesterFromDb = async (req) => {
    const requesterLookupConditions = [];
    const requesterUserId = req.userId || req.user?.id || req.user?._id || null;
    if (requesterUserId && isObjectIdString(requesterUserId)) {
        requesterLookupConditions.push({ _id: String(requesterUserId).trim() });
    }
    if (req.user?.email) {
        requesterLookupConditions.push({ email: req.user.email });
    }

    if (!requesterLookupConditions.length) {
        return null;
    }

    return User.findOne({ $or: requesterLookupConditions }).select('_id email activeRole');
};

const fireAndForget = (promise, label) => {
    promise.catch((error) => {
        logger.error('notify', `${label} failed`, error?.message || error);
    });
};

const clearDatabase = async (req, res, next) => {
    try {
        if (!req.user) {
            throw new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }

        const requester = await resolveRequesterFromDb(req);
        if (!requester) {
            throw new AppError('Unauthorized', StatusCodes.UNAUTHORIZED, 'UNAUTHORIZED');
        }

        if (requester.activeRole !== 'admin') {
            throw new AppError('Only users with current admin role can clear the database', StatusCodes.FORBIDDEN, 'FORBIDDEN');
        }

        const confirmation = String(req.body?.confirmation || '').trim().toUpperCase();
        if (confirmation !== CONFIRMATION_TEXT) {
            throw new AppError(
                `Confirmation must be '${CONFIRMATION_TEXT}'`,
                StatusCodes.BAD_REQUEST,
                'CLEAR_DB_CONFIRMATION_REQUIRED'
            );
        }

        const adminUsers = await User.find({
            $or: [
                { activeRole: 'admin' },
                { roles: 'admin' },
            ],
        }).select('_id email');

        const preservedAdminIds = adminUsers.map((user) => user._id);

        const requesterId = String(requester._id);
        const alreadyPreserved = preservedAdminIds.some((id) => String(id) === requesterId);
        if (!alreadyPreserved) {
            preservedAdminIds.push(requester._id);
        }

        const [
            incidentResult,
            incidentMessageResult,
            smsResult,
            deletedUsersResult,
            resetAdminsResult,
        ] = await Promise.all([
            Incident.deleteMany({}),
            IncidentMessage.deleteMany({}),
            SmsMessage.deleteMany({}),
            User.deleteMany({ _id: { $nin: preservedAdminIds } }),
            User.updateMany(
                { _id: { $in: preservedAdminIds } },
                {
                    $set: {
                        assignedIncident: null,
                        isOnline: false,
                        currentLocation: { type: 'Point', coordinates: [0, 0] },
                        lastSeen: new Date(),
                    },
                }
            ),
        ]);

        const summary = {
            incidentsCleared: incidentResult?.deletedCount || 0,
            incidentMessagesCleared: incidentMessageResult?.deletedCount || 0,
            smsMessagesCleared: smsResult?.deletedCount || 0,
            usersDeleted: deletedUsersResult?.deletedCount || 0,
            adminsPreserved: preservedAdminIds.length,
            adminsReset: resetAdminsResult?.modifiedCount || 0,
        };

        logger.warn('server', 'Database cleared by admin', {
            byUserId: requester._id,
            summary,
        });

        fireAndForget(
            notifyAdminAudit({
                action: 'clear-database',
                details: `Database clear executed by admin ${requester._id}. Incidents cleared: ${summary.incidentsCleared}, users deleted: ${summary.usersDeleted}.`,
                meta: {
                    actorId: requester._id?.toString?.() || String(requester._id),
                    summary,
                },
            }),
            'admin-audit-clear-db'
        );

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