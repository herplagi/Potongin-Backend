// backend/src/routes/booking.routes.js - COMPLETE & TESTED
const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/booking.controller');
const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');

// Middleware helpers
const customerMiddleware = [authMiddleware, checkRole('customer')];
const ownerMiddleware = [authMiddleware, checkRole('owner')];

// ============================================
// TEST ROUTE (HAPUS SETELAH TESTING SELESAI)
// ============================================
router.all('/test', (req, res) => {
  res.json({ message: 'Booking routes loaded successfully!', method: req.method });
});

// ============================================
// PUBLIC ROUTES
// ============================================
router.post('/payment-notification', BookingController.handlePaymentNotification);

// ============================================
// GENERAL AUTHENTICATED ROUTES
// ============================================
router.get('/check-availability', authMiddleware, BookingController.checkAvailability);

// ============================================
// CUSTOMER ROUTES
// ============================================

// Create & get bookings
router.post('/', customerMiddleware, BookingController.createBooking);
router.get('/my-bookings', customerMiddleware, BookingController.getMyBookings);

// Check-in
router.post('/check-in/qr', customerMiddleware, BookingController.checkInWithQR);
router.post('/check-in/pin', customerMiddleware, BookingController.checkInWithPIN);

// ✅✅✅ RESCHEDULE & CONFIRM (BEFORE GENERIC :bookingId ROUTES)
router.get('/:bookingId/reschedule-status', customerMiddleware, BookingController.checkRescheduleStatus);
router.post('/:bookingId/reschedule', customerMiddleware, BookingController.rescheduleBooking);
router.post('/:bookingId/confirm-completed', customerMiddleware, BookingController.confirmServiceCompleted);

// ============================================
// OWNER ROUTES (NESTED PATHS FIRST)
// ============================================
router.post('/:barbershopId/bookings/:bookingId/start', ownerMiddleware, BookingController.startService);
router.post('/:barbershopId/bookings/:bookingId/complete', ownerMiddleware, BookingController.completeService);
router.patch('/:barbershopId/bookings/:bookingId/status', ownerMiddleware, BookingController.updateBookingStatus);

// Get barbershop bookings (MUST BE LAST - generic param)
router.get('/:barbershopId', ownerMiddleware, BookingController.getOwnerBookings);

console.log('✅ Booking routes initialized');

module.exports = router;