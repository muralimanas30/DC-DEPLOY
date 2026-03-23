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
    getIncidentMapFeed,
    listIncidentMessages,
    sendIncidentMessage,
    sendIncidentAlert,
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
    getIncidentMapFeed,
    listIncidentMessages,
    sendIncidentMessage,
    sendIncidentAlert,
};

module.exports = { incidentController };
