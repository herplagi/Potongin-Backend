// src/services/notification.service.js

const Notification = require('../models/Notification.model');
const User = require('../models/User.model');
const Barbershop = require('../models/Barbershop.model'); // ✅ TAMBAHKAN IMPORT INI

class NotificationService {
    /**
     * Create a notification for a user
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
    
    /**
     * ✅ FIXED: Notify owner about new booking
     */
    static async notifyOwnerNewBooking(barbershopId, bookingDetails) {
        try {
            console.log(`📢 Memulai notifikasi untuk booking baru di barbershop ${barbershopId}...`);

            // 1. Cari barbershop beserta owner-nya
            const barbershop = await Barbershop.findByPk(barbershopId, {
                include: [{
                    model: User,
                    as: 'owner',
                    attributes: ['user_id', 'name', 'email']
                }]
            });

            // 2. Validasi apakah barbershop dan ownernya ditemukan
            if (!barbershop) {
                console.error(`❌ Barbershop dengan ID ${barbershopId} tidak ditemukan.`);
                return;
            }
            if (!barbershop.owner) {
                console.warn(`⚠️ Owner untuk barbershop ${barbershop.name} (${barbershopId}) tidak ditemukan atau tidak terhubung.`);
                return;
            }

            const ownerId = barbershop.owner.user_id;
            const ownerName = barbershop.owner.name;
            console.log(`🔍 Owner ditemukan: ${ownerName} (ID: ${ownerId}) untuk barbershop ${barbershop.name}`);

            // 3. Format waktu booking dengan baik
            const bookingTime = new Date(bookingDetails.bookingTime);
            const formattedTime = bookingTime.toLocaleString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            // 4. Buat notifikasi
            await this.createNotification(
                ownerId,
                'booking_created',
                '🎉 Booking Baru Diterima!',
                `Anda mendapatkan booking baru untuk layanan "${bookingDetails.serviceName}" dari ${bookingDetails.customerName} pada ${formattedTime}.`,
                { 
                    booking_id: bookingDetails.bookingId,
                    barbershop_id: barbershopId,
                    customer_name: bookingDetails.customerName,
                    service_name: bookingDetails.serviceName
                }
            );

            console.log(`✅ Notifikasi booking baru berhasil dikirim ke owner ${ownerName} (User ID: ${ownerId}).`);

        } catch (error) {
            console.error('❌ Gagal mengirim notifikasi booking ke owner:', error);
        }
    }
}

module.exports = NotificationService;