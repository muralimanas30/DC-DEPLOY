const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/auth");
const { incidentController } = require("../controllers/incidentController");

router.post("/", authMiddleware, incidentController.createIncident);
router.get("/", authMiddleware, incidentController.listIncidents);
router.get("/:incidentId", authMiddleware, incidentController.getIncidentById);

module.exports = { incidentRouter: router };
