// src/services/notification.service.js

const Notification = require("../models/Notification.model");
const User = require("../models/User.model");
const Barbershop = require("../models/Barbershop.model");

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
      console.error("Error creating notification:", error);
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
        order: [["createdAt", "DESC"]],
        limit,
      });
      return notifications;
    } catch (error) {
      console.error("Error fetching notifications:", error);
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
      console.error("Error fetching unread count:", error);
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
        throw new Error("Notification not found");
      }
      await notification.update({
        is_read: true,
        read_at: new Date(),
      });
      return notification;
    } catch (error) {
      console.error("Error marking notification as read:", error);
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
        { where: { user_id: userId, is_read: false } },
      );
    } catch (error) {
      console.error("Error marking all as read:", error);
      throw error;
    }
  }

  /**
   * ✅ FIXED: Send booking created notification (DIPANGGIL DARI CONTROLLER)
   */
  static async sendBookingCreated(customerId, bookingId) {
    try {
      await this.createNotification(
        customerId,
        "booking_created",
        "📝 Booking Berhasil Dibuat",
        "Booking Anda telah dibuat. Silakan lanjutkan pembayaran untuk mengkonfirmasi.",
        { booking_id: bookingId },
      );
      console.log(`📨 Booking created notification sent to user ${customerId}`);
    } catch (error) {
      console.error("Error sending booking created notification:", error);
      // Don't throw - jangan sampai gagal notifikasi menggagalkan booking
    }
  }

  /**
   * Helper: Send booking created notification (LEGACY - untuk backward compatibility)
   */
  static async notifyBookingCreated(customerId, bookingDetails) {
    return this.createNotification(
      customerId,
      "booking_created",
      "Booking Berhasil Dibuat",
      `Booking Anda untuk ${bookingDetails.serviceName} telah dibuat. Silakan lanjutkan pembayaran.`,
      { booking_id: bookingDetails.bookingId },
    );
  }

  /**
   * Helper: Send payment success notification
   */
  static async notifyPaymentSuccess(customerId, bookingDetails) {
    return this.createNotification(
      customerId,
      "payment_success",
      "Pembayaran Berhasil",
      `Pembayaran untuk booking ${bookingDetails.serviceName} berhasil dikonfirmasi.`,
      { booking_id: bookingDetails.bookingId },
    );
  }

  /**
   * Helper: Send booking reminder notification
   */
  static async notifyBookingReminder(customerId, bookingDetails) {
    return this.createNotification(
      customerId,
      "booking_reminder",
      "Pengingat Booking",
      `Jangan lupa! Booking Anda di ${bookingDetails.barbershopName} akan dimulai dalam 1 jam.`,
      { booking_id: bookingDetails.bookingId },
    );
  }

  /**
   * ✅ FIXED: Notify owner about new booking
   */
  static async notifyOwnerNewBooking(barbershopId, bookingDetails) {
    try {
      console.log(
        `📢 Memulai notifikasi untuk booking baru di barbershop ${barbershopId}...`,
      );

      // 1. Cari barbershop beserta owner-nya
      const barbershop = await Barbershop.findByPk(barbershopId, {
        include: [
          {
            model: User,
            as: "owner",
            attributes: ["user_id", "name", "email"],
          },
        ],
      });

      // 2. Validasi apakah barbershop dan ownernya ditemukan
      if (!barbershop) {
        console.error(
          `❌ Barbershop dengan ID ${barbershopId} tidak ditemukan.`,
        );
        return;
      }
      if (!barbershop.owner) {
        console.warn(
          `⚠️ Owner untuk barbershop ${barbershop.name} (${barbershopId}) tidak ditemukan atau tidak terhubung.`,
        );
        return;
      }

      const ownerId = barbershop.owner.user_id;
      const ownerName = barbershop.owner.name;
      console.log(
        `🔍 Owner ditemukan: ${ownerName} (ID: ${ownerId}) untuk barbershop ${barbershop.name}`,
      );

      // 3. Format waktu booking dengan baik
      const bookingTime = new Date(bookingDetails.bookingTime);
      const formattedTime = bookingTime.toLocaleString("id-ID", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });

      // 4. Buat notifikasi
      await this.createNotification(
        ownerId,
        "booking_created",
        "🎉 Booking Baru Diterima!",
        `Anda mendapatkan booking baru untuk layanan "${bookingDetails.serviceName}" dari ${bookingDetails.customerName} pada ${formattedTime}.`,
        {
          booking_id: bookingDetails.bookingId,
          barbershop_id: barbershopId,
          customer_name: bookingDetails.customerName,
          service_name: bookingDetails.serviceName,
        },
      );

      console.log(
        `✅ Notifikasi booking baru berhasil dikirim ke owner ${ownerName} (User ID: ${ownerId}).`,
      );
    } catch (error) {
      console.error("❌ Gagal mengirim notifikasi booking ke owner:", error);
    }
  }

  // ✅✅✅ NEW: Notifikasi booking confirmed dengan check-in credentials
  static async sendBookingConfirmed(userId, bookingId, credentials) {
    try {
      await this.createNotification(
        userId,
        "booking_confirmed",
        "✅ Booking Dikonfirmasi!",
        `Pembayaran berhasil! PIN Check-in Anda: ${credentials.pin}. Tunjukkan saat tiba di barbershop.`,
        {
          booking_id: bookingId,
          check_in_pin: credentials.pin,
          qr_token: credentials.qrToken,
        },
      );
      console.log(`📨 Booking confirmed notification sent to user ${userId}`);
    } catch (error) {
      console.error("Error sending booking confirmed notification:", error);
    }
  }

  // ✅✅✅ NEW: Notifikasi customer sudah check-in (ke owner)
  static async sendCustomerCheckedIn(barbershopId, bookingId, customerId) {
    try {
      const barbershop = await Barbershop.findByPk(barbershopId);

      if (barbershop) {
        await this.createNotification(
          barbershop.owner_id,
          "customer_checked_in",
          "🔔 Customer Check-in",
          "Customer sudah tiba dan check-in. Silakan mulai layanan.",
          {
            booking_id: bookingId,
            barbershop_id: barbershopId,
          },
        );
        console.log(
          `📨 Check-in notification sent to owner ${barbershop.owner_id}`,
        );
      }
    } catch (error) {
      console.error("Error sending check-in notification:", error);
    }
  }

  // ✅✅✅ NEW: Notifikasi layanan dimulai
  static async sendServiceStarted(userId, bookingId) {
    try {
      await this.createNotification(
        userId,
        "service_started",
        "💈 Layanan Dimulai",
        "Staff sedang melayani Anda. Nikmati layanan kami!",
        { booking_id: bookingId },
      );
      console.log(`📨 Service started notification sent to user ${userId}`);
    } catch (error) {
      console.error("Error sending service started notification:", error);
    }
  }

  // ✅✅✅ NEW: Notifikasi layanan selesai (tunggu konfirmasi)
  static async sendServiceCompleted(userId, bookingId) {
    try {
      await this.createNotification(
        userId,
        "service_completed",
        "✅ Layanan Selesai",
        "Layanan Anda sudah selesai. Mohon konfirmasi untuk menyelesaikan booking.",
        {
          booking_id: bookingId,
          action_required: true,
        },
      );
      console.log(`📨 Service completed notification sent to user ${userId}`);
    } catch (error) {
      console.error("Error sending service completed notification:", error);
    }
  }

  // ✅ Notifikasi auto-completed
  static async sendAutoCompletedNotification(userId, bookingId) {
    try {
      await this.createNotification(
        userId,
        "booking_auto_completed",
        "✅ Booking Selesai",
        "Booking Anda telah dikonfirmasi selesai secara otomatis. Terima kasih!",
        { booking_id: bookingId },
      );
    } catch (error) {
      console.error("Error sending auto-completed notification:", error);
    }
  }

  // ✅ Notifikasi no-show ke owner
  static async sendNoShowNotification(barbershopId, bookingId) {
    try {
      const barbershop = await Barbershop.findByPk(barbershopId);

      if (barbershop) {
        await this.createNotification(
          barbershop.owner_id,
          "booking_no_show",
          "⚠️ Customer No-Show",
          "Customer tidak check-in untuk booking. Status diubah menjadi no-show.",
          {
            booking_id: bookingId,
            barbershop_id: barbershopId,
          },
        );
      }
    } catch (error) {
      console.error("Error sending no-show notification:", error);
    }
  }

  // ✅ Notifikasi reminder 1 jam sebelum booking
  static async sendBookingReminder(userId, bookingId, checkInCode) {
    try {
      await this.createNotification(
        userId,
        "booking_reminder",
        "⏰ Reminder: Booking 1 Jam Lagi",
        `Booking Anda 1 jam lagi! PIN Check-in: ${checkInCode}. Jangan lupa datang tepat waktu.`,
        {
          booking_id: bookingId,
          check_in_code: checkInCode,
        },
      );
    } catch (error) {
      console.error("Error sending reminder notification:", error);
    }
  }

  /**
   * ✅ Send booking rescheduled notification
   */
  static async sendBookingRescheduled(userId, bookingId, data) {
    try {
      let message = `Booking Anda berhasil di-reschedule ke ${new Date(data.newTime).toLocaleString("id-ID")}. PIN check-in baru: ${data.pin}. ⚠️ Ini kesempatan terakhir Anda!`;

      if (data.staffChanged) {
        message += ` Staff Anda diganti menjadi: ${data.newStaffName}.`;
      }

      const notification = await Notification.create({
        user_id: userId,
        booking_id: bookingId,
        type: "booking_rescheduled",
        title: "Booking Di-reschedule",
        message,
        data: JSON.stringify(data),
      });

      console.log("📨 Reschedule notification sent to user:", userId);
      return notification;
    } catch (error) {
      console.error("❌ Error sending reschedule notification:", error);
      return null;
    }
  }

  /**
   * ✅ Send no-show notification to barbershop owner
   */
  static async sendNoShowNotification(barbershopId, bookingId) {
    try {
      const barbershop = await Barbershop.findByPk(barbershopId);
      if (!barbershop) return;

      const notification = await Notification.create({
        user_id: barbershop.owner_id,
        booking_id: bookingId,
        type: "booking_no_show",
        title: "Customer No-Show",
        message: "Customer tidak hadir untuk booking ini (terlambat 2x).",
        data: JSON.stringify({ barbershopId, bookingId }),
      });

      console.log(
        "📨 No-show notification sent to owner:",
        barbershop.owner_id,
      );
      return notification;
    } catch (error) {
      console.error("❌ Error sending no-show notification:", error);
      return null;
    }
  }

  /**
   * ✅ Send auto-completed notification
   */
  static async sendAutoCompletedNotification(customerId, bookingId) {
    try {
      const notification = await Notification.create({
        user_id: customerId,
        booking_id: bookingId,
        type: "booking_auto_completed",
        title: "Booking Selesai",
        message:
          "Booking Anda telah selesai secara otomatis. Jangan lupa berikan review!",
        data: JSON.stringify({ bookingId }),
      });

      console.log(
        "📨 Auto-completed notification sent to customer:",
        customerId,
      );
      return notification;
    } catch (error) {
      console.error("❌ Error sending auto-completed notification:", error);
      return null;
    }
  }
}

module.exports = NotificationService;
