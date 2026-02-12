// backend/src/helpers/bookingHelpers.js
const crypto = require('crypto');

/**
 * Generate 6-digit PIN untuk check-in
 */
exports.generateCheckInPIN = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Generate unique token untuk QR code
 */
exports.generateQRToken = (bookingId) => {
    return crypto
        .createHash('sha256')
        .update(`${bookingId}-${Date.now()}-${Math.random()}`)
        .digest('hex')
        .substring(0, 32);
};

/**
 * Validasi apakah waktu check-in valid
 */
exports.validateCheckInTime = (bookingTime) => {
    const now = new Date();
    const bookingDate = new Date(bookingTime);
    const earlyCheckIn = new Date(bookingDate.getTime() - 60 * 60000); // 30 min sebelum
    const lateCheckIn = new Date(bookingDate.getTime() + 15 * 60000);  // 15 min setelah
    
    if (now < earlyCheckIn) {
        return {
            valid: false,
            reason: 'too_early',
            message: 'Terlalu awal untuk check-in. Anda bisa check-in 30 menit sebelum jadwal.'
        };
    }
    
    if (now > lateCheckIn) {
        return {
            valid: false,
            reason: 'too_late',
            message: 'Waktu check-in sudah lewat. Booking akan dibatalkan.'
        };
    }
    
    return { valid: true };
};

/**
 * Format booking untuk response
 */
exports.formatBookingResponse = (booking) => {
    return {
        ...booking.toJSON(),
        // Tambahkan computed fields
        canCheckIn: booking.status === 'confirmed',
        canStart: booking.status === 'checked_in',
        canComplete: booking.status === 'in_progress',
        canConfirm: booking.status === 'awaiting_confirmation',
        canReview: booking.status === 'completed',
    };
};

/**
 * Cek apakah booking terlambat untuk check-in
 */
exports.isLateForCheckIn = (bookingTime) => {
    const now = new Date();
    const bookingDate = new Date(bookingTime);
    const lateCheckIn = new Date(bookingDate.getTime() + 15 * 60000);  // 15 min setelah
    
    return now > lateCheckIn;
};

/**
 * Cek apakah booking bisa di-reschedule
 */
exports.canReschedule = (booking) => {
    const isLate = exports.isLateForCheckIn(booking.booking_time);
    const hasNotRescheduled = booking.reschedule_count === 0;
    const isConfirmed = booking.status === 'confirmed';
    
    return isLate && hasNotRescheduled && isConfirmed;
};

/**
 * Cek apakah booking harus menjadi no-show
 */
exports.shouldBeNoShow = (booking) => {
    const isLate = exports.isLateForCheckIn(booking.booking_time);
    const alreadyRescheduled = booking.reschedule_count >= 1;
    const isConfirmed = booking.status === 'confirmed';
    
    return isLate && alreadyRescheduled && isConfirmed;
};