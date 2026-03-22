const express = require('express');
const router = express.Router();
const { authController } = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/register', authController.register);
router.post('/check',authController.checkUser)
router.post('/oauth', authController.oauthLogin);
module.exports = { authRouter: router };
