const express = require('express');

const { authRouter } = require('./auth');
const { userRouter } = require('./user');
const { incidentRouter } = require('./incident');

const router = express.Router();
router.use('/auth', authRouter);
router.use('/user', userRouter);
router.use('/incidents', incidentRouter);
module.exports = { router }
