const { StatusCodes } = require("http-status-codes");
const { AppError } = require("../../errorHandler/errorHandler");
const Incident = require("../../models/Incident");
const { sendSuccess } = require("../../utils/response");

const getIncidentById = async (req, res, next) => {
    try {
        const { incidentId } = req.params;
        const incident = await Incident.findById(incidentId);

        if (!incident) {
            throw new AppError("Incident not found", StatusCodes.NOT_FOUND, "INCIDENT_NOT_FOUND");
        }

        return sendSuccess(res, {
            statusCode: StatusCodes.OK,
            msg: "Incident fetched successfully",
            data: {
                incident,
            },
        });
    } catch (err) {
        next(err);
    }
};

module.exports = { getIncidentById };
