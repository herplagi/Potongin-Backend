// src/routes/review.routes.js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');
const ReviewController = require('../controllers/review.controller');

// ===== PUBLIC ROUTES =====
// Get public reviews for a barbershop (untuk customer app preview)
router.get('/public/barbershop/:barbershopId', ReviewController.getPublicBarbershopReviews);

// ===== CUSTOMER ROUTES (MOBILE) =====
router.post('/', authMiddleware, checkRole('customer'), ReviewController.createReview);
router.get('/my-reviews', authMiddleware, checkRole('customer'), ReviewController.getMyReviews);
router.get('/can-review/:booking_id', authMiddleware, checkRole('customer'), ReviewController.checkCanReview);

// ===== OWNER ROUTES (WEB) =====
router.get('/owner/barbershop/:barbershopId', authMiddleware, checkRole('owner'), ReviewController.getOwnerBarbershopReviews);

// ===== ADMIN ROUTES (WEB) =====
router.get('/admin/all', authMiddleware, checkRole('admin'), ReviewController.getAllReviews);
router.get('/admin/stats', authMiddleware, checkRole('admin'), ReviewController.getReviewStats);
router.patch('/admin/:reviewId/moderate', authMiddleware, checkRole('admin'), ReviewController.moderateReview);
router.delete('/admin/:reviewId', authMiddleware, checkRole('admin'), ReviewController.deleteReview);

module.exports = router;