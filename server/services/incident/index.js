const { createIncident } = require("./create");
const { listIncidents } = require("./list");
const { getIncidentById } = require("./detail");
const { resolveIncident } = require("./resolve");
const { joinIncident, leaveIncident, assignUser, unassignUser } = require("./participation");

module.exports = {
    createIncident,
    listIncidents,
    getIncidentById,
    resolveIncident,
    joinIncident,
    leaveIncident,
    assignUser,
    unassignUser,
};
