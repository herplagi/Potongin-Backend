const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');
const checkRole = require('../middleware/checkRole.middleware');
const BookingController = require('../controllers/booking.controller');

// Customer Routes
router.post('/', authMiddleware, checkRole('customer'), BookingController.createBooking);
router.get('/my-bookings', authMiddleware, checkRole('customer'), BookingController.getMyBookings);

router.get('/check-availability', BookingController.checkStaffAvailability);

// Owner Routes
router.get('/barbershop/:barbershopId', authMiddleware, checkRole('owner'), BookingController.getOwnerBookings);
router.patch('/barbershop/:barbershopId/:bookingId', authMiddleware, checkRole('owner'), BookingController.updateBookingStatus);

// Midtrans Webhook (no auth needed)
router.post('/payment-notification', BookingController.handlePaymentNotification);

module.exports = router;