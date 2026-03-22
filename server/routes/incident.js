const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/auth");
const { incidentController } = require("../controllers/incidentController");

router.post("/", authMiddleware, incidentController.createIncident);
router.get("/", authMiddleware, incidentController.listIncidents);
router.get("/:incidentId", authMiddleware, incidentController.getIncidentById);
router.post("/:incidentId/join", authMiddleware, incidentController.joinIncident);
router.post("/:incidentId/leave", authMiddleware, incidentController.leaveIncident);
router.post("/:incidentId/assign", authMiddleware, incidentController.assignUser);
router.delete("/:incidentId/assign/:userId", authMiddleware, incidentController.unassignUser);
router.patch("/:incidentId/resolve", authMiddleware, incidentController.resolveIncident);

module.exports = { incidentRouter: router };
