const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');
const AdminController = require('../controllers/admin.controller');

router.use(authMiddleware, checkRole('admin'));

router.get('/admins', AdminController.getAllAdmins);
router.get('/barbershops', AdminController.getAllBarbershops);
router.get('/barbershops/:id', AdminController.getBarbershopById);
router.patch('/barbershops/:id/approve', AdminController.approveBarbershop);
router.patch('/barbershops/:id/reject', AdminController.rejectBarbershop);
router.post('/create-admin', AdminController.createAdmin);
router.get('/stats', AdminController.getDashboardStats);

module.exports = router;