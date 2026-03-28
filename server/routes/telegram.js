const express = require('express');
const { authMiddleware } = require('../middlewares/auth');
const { telegramController } = require('../controllers/telegramController');

const router = express.Router();

router.post('/report', authMiddleware, telegramController.createReportTelegram);
router.post('/incidents/:incidentId/notify', authMiddleware, telegramController.notifyIncidentVictimsTelegram);
router.get('/incidents/:incidentId/logs', authMiddleware, telegramController.getIncidentTelegramLogs);
router.post('/webhook', telegramController.webhookHandler);

module.exports = { telegramRouter: router };