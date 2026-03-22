const { StatusCodes } = require("http-status-codes");
const Incident = require("../../models/Incident");
const { sendSuccess } = require("../../utils/response");

const listIncidents = async (req, res, next) => {
    try {
        const page = Math.max(1, Number.parseInt(req.query.page || "1", 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || "10", 10)));
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.severity) filter.severity = req.query.severity;
        if (req.query.category) filter.category = req.query.category;
        if (req.query.createdByMe === "true") {
            filter.creatorId = req.user?.id || req.user?._id;
        }

        const [items, total] = await Promise.all([
            Incident.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Incident.countDocuments(filter),
        ]);

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Incidents fetched successfully",
            data: {
                incidents: items,
            },
            meta: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit) || 1,
            },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { listIncidents };
