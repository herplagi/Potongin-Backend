// backend/src/routes/user.routes.js - COMPLETE
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const uploadProfilePicture = require('../middleware/uploadProfilePicture.middleware');
const UserController = require('../controllers/user.controller');

// Get current user profile
router.get('/profile', authMiddleware, UserController.getMyProfile);
// Update profile
router.patch('/profile', authMiddleware, UserController.updateProfile);
// Change password
router.patch('/change-password', authMiddleware, UserController.changePassword);
// Upload profile picture
router.post(
    '/profile-picture', 
    authMiddleware, 
    uploadProfilePicture.single('picture'), 
    UserController.uploadProfilePicture
);

module.exports = router;