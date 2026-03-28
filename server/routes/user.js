const express = require('express');
const router = express.Router();
const { userController } = require('../controllers/userController');
const { authMiddleware } = require('../middlewares/auth');

router.patch('/update', authMiddleware, userController.updateUser);
router.patch('/update/:id', authMiddleware, userController.updateUser);
router.post('/admin/clear-db', authMiddleware, userController.clearDatabase);
module.exports = { userRouter: router };
