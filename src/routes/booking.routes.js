// backend/src/routes/booking.routes.js
const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/booking.controller');
const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');

// Middleware helpers
const customerMiddleware = [authMiddleware, checkRole('customer')];
const ownerMiddleware = [authMiddleware, checkRole('owner')];

// ============================================
// CUSTOMER ROUTES
// ============================================

// ✅ CHECK AVAILABILITY (HARUS DI ATAS ROUTES LAIN!)
router.get('/check-availability', authMiddleware, BookingController.checkAvailability);

// Create booking
router.post('/', customerMiddleware, BookingController.createBooking);

// Get my bookings
router.get('/my-bookings', customerMiddleware, BookingController.getMyBookings);

// ✅✅✅ NEW: Check-in routes
router.post('/check-in/qr', customerMiddleware, BookingController.checkInWithQR);
router.post('/check-in/pin', customerMiddleware, BookingController.checkInWithPIN);

// ✅✅✅ NEW: Confirm service completed
router.post('/:bookingId/confirm-completed', customerMiddleware, BookingController.confirmServiceCompleted);

// ============================================
// OWNER ROUTES
// ============================================

// Get barbershop bookings
router.get('/:barbershopId', ownerMiddleware, BookingController.getOwnerBookings);

// ✅✅✅ NEW: Service management routes
router.post('/:barbershopId/bookings/:bookingId/start', ownerMiddleware, BookingController.startService);
router.post('/:barbershopId/bookings/:bookingId/complete', ownerMiddleware, BookingController.completeService);

// Update booking status (backward compatibility)
router.patch('/:barbershopId/bookings/:bookingId/status', ownerMiddleware, BookingController.updateBookingStatus);

// ============================================
// PAYMENT WEBHOOK (no auth)
// ============================================
router.post('/payment-notification', BookingController.handlePaymentNotification);

module.exports = router;