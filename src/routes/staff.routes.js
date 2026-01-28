// src/routes/staff.routes.js - PERBAIKAN
const express = require('express');
const router = express.Router({ mergeParams: true }); // ✅ mergeParams untuk ambil :barbershopId

const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');
const StaffController = require('../controllers/staff.controller');
const uploadStaffPhoto = require('../middleware/uploadStaffPhotos.middleware');

// ✅ PERBAIKAN: Pisahkan middleware untuk lebih jelas
// POST - Create staff (dengan upload foto)
router.post(
  '/',
  authMiddleware,
  checkRole('owner'),
  uploadStaffPhoto.single('photo'),
  StaffController.createStaff
);

// GET - Get all staff
router.get(
  '/',
  authMiddleware,
  checkRole('owner'),
  StaffController.getStaff
);

// PUT - Update staff (dengan upload foto)
router.put(
  '/:staffId',
  authMiddleware,
  checkRole('owner'),
  uploadStaffPhoto.single('photo'),
  StaffController.updateStaff
);

// PATCH - Deactivate staff
router.patch(
  '/:staffId/deactivate',
  authMiddleware,
  checkRole('owner'),
  StaffController.deactivateStaff
);

// PATCH - Activate staff
router.patch(
  '/:staffId/activate',
  authMiddleware,
  checkRole('owner'),
  StaffController.activateStaff
);

// POST - Reassign bookings
router.post(
  '/:staffId/reassign',
  authMiddleware,
  checkRole('owner'),
  StaffController.reassignBookings
);

// DELETE - Delete staff permanently
router.delete(
  '/:staffId',
  authMiddleware,
  checkRole('owner'),
  StaffController.deleteStaff
);

module.exports = router;