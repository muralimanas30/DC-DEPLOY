const {
    createIncident,
    listIncidents,
    getIncidentById,
    resolveIncident,
    joinIncident,
    leaveIncident,
    assignUser,
    unassignUser,
} = require("../services/incident");

const incidentController = {
    createIncident,
    listIncidents,
    getIncidentById,
    resolveIncident,
    joinIncident,
    leaveIncident,
    assignUser,
    unassignUser,
};

module.exports = { incidentController };
