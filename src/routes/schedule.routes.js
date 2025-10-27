// src/routes/schedule.routes.js
const express = require('express');
const router = express.Router({ mergeParams: true });

const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');
const ScheduleController = require('../controllers/schedule.controller');

const ownerMiddleware = [authMiddleware, checkRole('owner')];

// Get schedule
router.get('/', ownerMiddleware, ScheduleController.getSchedule);

// Update all schedules (batch)
router.put('/', ownerMiddleware, ScheduleController.updateSchedule);

// Update single day
router.patch('/:scheduleId', ownerMiddleware, ScheduleController.updateSingleDay);

module.exports = router;