const {
    createIncident,
    listIncidents,
    getIncidentById,
    resolveIncident,
    forceCloseIncident,
    joinIncident,
    leaveIncident,
    assignUser,
    unassignUser,
    getIncidentParticipants,
    getAvailableVolunteers,
} = require("../services/incident");

const incidentController = {
    createIncident,
    listIncidents,
    getIncidentById,
    resolveIncident,
    forceCloseIncident,
    joinIncident,
    leaveIncident,
    assignUser,
    unassignUser,
    getIncidentParticipants,
    getAvailableVolunteers,
};

module.exports = { incidentController };
