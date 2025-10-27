// src/routes/staff.routes.js
const express = require('express');
const router = express.Router({ mergeParams: true });

const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');
const StaffController = require('../controllers/staff.controller');
const uploadStaffPhoto = require('../middleware/uploadStaffPhotos.middleware');

const ownerMiddleware = [authMiddleware, checkRole('owner')];

// ✅ Semua route dengan upload foto
router.post('/', ownerMiddleware, uploadStaffPhoto.single('photo'), StaffController.createStaff);
router.get('/', ownerMiddleware, StaffController.getStaff);
router.put('/:staffId', ownerMiddleware, uploadStaffPhoto.single('photo'), StaffController.updateStaff);

// ✅ NEW: Routes untuk aktif/nonaktif
router.patch('/:staffId/deactivate', ownerMiddleware, StaffController.deactivateStaff);
router.patch('/:staffId/activate', ownerMiddleware, StaffController.activateStaff);

// Hapus permanen (opsional)
router.delete('/:staffId', ownerMiddleware, StaffController.deleteStaff);

module.exports = router;