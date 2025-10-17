// ✅ TAMBAHKAN IMPORT INI DI AWAL FILE
const Notification = require('../models/Notification.model');

class NotificationService {
    /**
     * Create a notification for a user
     * @param {string} userId - User ID
     * @param {string} type - Notification type
     * @param {string} title - Notification title
     * @param {string} message - Notification message
     * @param {object} data - Additional data (optional)
     */
    static async createNotification(userId, type, title, message, data = null) {
        try {
            const notification = await Notification.create({
                user_id: userId,
                type,
                title,
                message,
                data,
                is_read: false,
            });
            return notification;
        } catch (error) {
            console.error('Error creating notification:', error);
            throw error;
        }
    }

    /**
     * Get all notifications for a user
     * @param {string} userId - User ID
     * @param {number} limit - Limit results (optional)
     */
    static async getUserNotifications(userId, limit = 50) {
        try {
            const notifications = await Notification.findAll({
                where: { user_id: userId },
                order: [['createdAt', 'DESC']],
                limit,
            });
            return notifications;
        } catch (error) {
            console.error('Error fetching notifications:', error);
            throw error;
        }
    }

    /**
     * Get unread notification count
     * @param {string} userId - User ID
     */
    static async getUnreadCount(userId) {
        try {
            const count = await Notification.count({
                where: { user_id: userId, is_read: false },
            });
            return count;
        } catch (error) {
            console.error('Error fetching unread count:', error);
            throw error;
        }
    }

    /**
     * Mark notification as read
     * @param {string} notificationId - Notification ID
     */
    static async markAsRead(notificationId) {
        try {
            const notification = await Notification.findByPk(notificationId);
            if (!notification) {
                throw new Error('Notification not found');
            }
            await notification.update({
                is_read: true,
                read_at: new Date(),
            });
            return notification;
        } catch (error) {
            console.error('Error marking notification as read:', error);
            throw error;
        }
    }

    /**
     * Mark all notifications as read for a user
     * @param {string} userId - User ID
     */
    static async markAllAsRead(userId) {
        try {
            await Notification.update(
                { is_read: true, read_at: new Date() },
                { where: { user_id: userId, is_read: false } }
            );
        } catch (error) {
            console.error('Error marking all as read:', error);
            throw error;
        }
    }

    /**
     * Helper: Send booking created notification
     */
    static async notifyBookingCreated(customerId, bookingDetails) {
        return this.createNotification(
            customerId,
            'booking_created',
            'Booking Berhasil Dibuat',
            `Booking Anda untuk ${bookingDetails.serviceName} telah dibuat. Silakan lanjutkan pembayaran.`,
            { booking_id: bookingDetails.bookingId }
        );
    }

    /**
     * Helper: Send payment success notification
     */
    static async notifyPaymentSuccess(customerId, bookingDetails) {
        return this.createNotification(
            customerId,
            'payment_success',
            'Pembayaran Berhasil',
            `Pembayaran untuk booking ${bookingDetails.serviceName} berhasil dikonfirmasi.`,
            { booking_id: bookingDetails.bookingId }
        );
    }

    /**
     * Helper: Send booking reminder notification
     */
    static async notifyBookingReminder(customerId, bookingDetails) {
        return this.createNotification(
            customerId,
            'booking_reminder',
            'Pengingat Booking',
            `Jangan lupa! Booking Anda di ${bookingDetails.barbershopName} akan dimulai dalam 1 jam.`,
            { booking_id: bookingDetails.bookingId }
        );
    }
}

module.exports = NotificationService;