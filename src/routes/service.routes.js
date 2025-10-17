// src/routes/service.routes.js
const express = require('express');
// Opsi { mergeParams: true } PENTING agar rute ini bisa membaca :barbershopId dari parent router
const router = express.Router({ mergeParams: true }); 

const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');
const ServiceController = require('../controllers/service.controller');

const ownerMiddleware = [authMiddleware, checkRole('owner')];

// URL di sini relatif terhadap prefix yang akan kita definisikan di app.js
// Contoh: '/' akan menjadi '/api/barbershops/:barbershopId/services/'
router.post('/', ownerMiddleware, ServiceController.createService);
router.get('/', ownerMiddleware, ServiceController.getServices);
router.put('/:serviceId', ownerMiddleware, ServiceController.updateService);
router.delete('/:serviceId', ownerMiddleware, ServiceController.deleteService);

module.exports = router;