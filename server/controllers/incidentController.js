const { createIncident, listIncidents, getIncidentById } = require("../services/incident");

const incidentController = {
    createIncident,
    listIncidents,
    getIncidentById,
};

module.exports = { incidentController };
