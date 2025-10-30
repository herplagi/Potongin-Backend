// src/routes/user.routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const UserController = require('../controllers/user.controller');

router.patch('/profile', authMiddleware, UserController.updateProfile);
router.patch('/change-password', authMiddleware, UserController.changePassword);

module.exports = router;