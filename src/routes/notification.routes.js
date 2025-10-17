// src/routes/notification.routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const NotificationService = require('../services/notification.service');

// Get user notifications
router.get('/', authMiddleware, async (req, res) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit) : 50;
        const notifications = await NotificationService.getUserNotifications(req.user.id, limit);
        res.status(200).json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get unread count
router.get('/unread-count', authMiddleware, async (req, res) => {
    try {
        const count = await NotificationService.getUnreadCount(req.user.id);
        res.status(200).json({ count });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Mark notification as read
router.patch('/:notificationId/read', authMiddleware, async (req, res) => {
    try {
        const notification = await NotificationService.markAsRead(req.params.notificationId);
        res.status(200).json({ message: 'Notification marked as read', notification });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Mark all as read
router.patch('/read-all', authMiddleware, async (req, res) => {
    try {
        await NotificationService.markAllAsRead(req.user.id);
        res.status(200).json({ message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;