const express = require('express');
// PENTING: Tambahkan { mergeParams: true } agar bisa membaca :barbershopId dari parent router
const router = express.Router({ mergeParams: true });

const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');
const StaffController = require('../controllers/staff.controller');

const ownerMiddleware = [authMiddleware, checkRole('owner')];

// Semua route ini akan relatif terhadap /api/barbershops/:barbershopId/staff
router.post('/', ownerMiddleware, StaffController.createStaff);
router.get('/', ownerMiddleware, StaffController.getStaff);
router.put('/:staffId', ownerMiddleware, StaffController.updateStaff);
router.delete('/:staffId', ownerMiddleware, StaffController.deleteStaff);

module.exports = router;