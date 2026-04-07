const express = require('express');
const mongoose = require('mongoose');

const { authRouter } = require('./auth');
const { userRouter } = require('./user');
const { incidentRouter } = require('./incident');
const { smsRouter } = require('./sms');

const router = express.Router();

router.get('/health', (_req, res) => {
	const dbState = mongoose.connection?.readyState;
	const dbConnected = dbState === 1;

	return res.status(200).json({
		status: 'success',
		statusCode: 200,
		msg: 'OK',
		data: {
			uptime: process.uptime(),
			dbConnected,
			dbState,
			timestamp: new Date().toISOString(),
		},
	});
});

router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/incidents', incidentRouter);
router.use('/sms', smsRouter);
module.exports = { router }
