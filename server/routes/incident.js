const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/auth");
const { incidentController } = require("../controllers/incidentController");

router.post("/", authMiddleware, incidentController.createIncident);
router.get("/", authMiddleware, incidentController.listIncidents);
router.get("/map-feed", authMiddleware, incidentController.getIncidentMapFeed);
router.get("/:incidentId", authMiddleware, incidentController.getIncidentById);
router.get("/:incidentId/participants", authMiddleware, incidentController.getIncidentParticipants);
router.get("/:incidentId/available-volunteers", authMiddleware, incidentController.getAvailableVolunteers);
router.get("/:incidentId/chat", authMiddleware, incidentController.listIncidentMessages);
router.post("/:incidentId/chat", authMiddleware, incidentController.sendIncidentMessage);
router.post("/:incidentId/chat/alert", authMiddleware, incidentController.sendIncidentAlert);
router.post("/:incidentId/join", authMiddleware, incidentController.joinIncident);
router.post("/:incidentId/leave", authMiddleware, incidentController.leaveIncident);
router.post("/:incidentId/assign", authMiddleware, incidentController.assignUser);
router.delete("/:incidentId/assign/:userId", authMiddleware, incidentController.unassignUser);
router.patch("/:incidentId/resolve", authMiddleware, incidentController.resolveIncident);
router.patch("/:incidentId/force-close", authMiddleware, incidentController.forceCloseIncident);

module.exports = { incidentRouter: router };
