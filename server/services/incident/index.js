const { createIncident } = require("./create");
const { listIncidents } = require("./list");
const { getIncidentById } = require("./detail");

module.exports = {
    createIncident,
    listIncidents,
    getIncidentById,
};
