const { createIncident } = require("./create");
const { listIncidents } = require("./list");
const { getIncidentById } = require("./detail");
const { resolveIncident, forceCloseIncident } = require("./resolve");
const { joinIncident, leaveIncident, assignUser, unassignUser } = require("./participation");
const { getIncidentParticipants, getAvailableVolunteers } = require("./management");
const { listIncidentMessages, sendIncidentMessage, sendIncidentAlert } = require("./chat");

module.exports = {
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
    listIncidentMessages,
    sendIncidentMessage,
    sendIncidentAlert,
};
