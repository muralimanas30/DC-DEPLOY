const express = require('express');
const { authMiddleware } = require('../middlewares/auth');
const { smsController } = require('../controllers/smsController');

const router = express.Router();

router.post('/webhook', smsController.webhookIncomingSms);
router.post('/report', authMiddleware, smsController.createReportSms);
router.post('/test', authMiddleware, smsController.sendSmsTest);
router.post('/incidents/:incidentId/notify', authMiddleware, smsController.notifyIncidentVictims);
router.get('/incidents/:incidentId/logs', authMiddleware, smsController.getIncidentSmsLogs);

module.exports = { smsRouter: router };
