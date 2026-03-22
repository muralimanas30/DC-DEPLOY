const express = require('express');
const router = express.Router();
const { userController } = require('../controllers/userController');
const { authMiddleware } = require('../middlewares/auth');

router.patch('/update/:id', authMiddleware, userController.updateUser);
module.exports = { userRouter: router };
