const { Op } = require("sequelize");
const Booking = require("../models/Booking.model");
const Service = require("../models/Service.model");
const Staff = require("../models/Staff.model");
const Barbershop = require("../models/Barbershop.model");
const User = require("../models/User.model");
const {
  snap,
  getFrontendUrl,
  getNotificationUrl,
} = require("../config/midtrans.config");
const NotificationService = require("../services/notification.service");

exports.createBooking = async (req, res) => {
  try {
    const customerId = req.user.id;
    let { barbershop_id, service_id, staff_id, booking_time } = req.body;

    // ✅ VALIDASI INPUT
    if (!barbershop_id || !service_id || !booking_time) {
      return res.status(400).json({
        message:
          "Informasi booking tidak lengkap. Diperlukan: barbershop_id, service_id, booking_time",
      });
    }

    // ✅ VALIDASI SERVICE EXISTS
    const service = await Service.findByPk(service_id);
    if (!service) {
      return res.status(404).json({ message: "Layanan tidak ditemukan." });
    }

    // ✅ VALIDASI BARBERSHOP EXISTS
    const barbershop = await Barbershop.findByPk(barbershop_id);
    if (!barbershop) {
      return res.status(404).json({ message: "Barbershop tidak ditemukan." });
    }

    // ✅ HITUNG WAKTU BOOKING
    const bookingStartTime = new Date(booking_time);
    const bookingEndTime = new Date(
      bookingStartTime.getTime() + service.duration_minutes * 60000
    );

    // ✅ VALIDASI TANGGAL TIDAK DI MASA LALU
    if (bookingStartTime < new Date()) {
      return res
        .status(400)
        .json({ message: "Tidak dapat membuat booking di masa lalu." });
    }

    // ✅ CEK KETERSEDIAAN STAFF
    if (staff_id) {
      const staff = await Staff.findByPk(staff_id);
      if (!staff) {
        return res.status(404).json({ message: "Staff tidak ditemukan." });
      }

      const conflictingBooking = await Booking.findOne({
        where: {
          staff_id: staff_id,
          status: { [Op.ne]: "cancelled" },
          booking_time: { [Op.lt]: bookingEndTime },
          end_time: { [Op.gt]: bookingStartTime },
        },
      });

      if (conflictingBooking) {
        return res.status(409).json({
          message:
            "Jadwal untuk staff ini sudah dipesan. Silakan pilih waktu atau staff lain.",
        });
      }
    } else {
      // Auto-assign staff yang available
      const allStaff = await Staff.findAll({ where: { barbershop_id } });
      if (!allStaff || allStaff.length === 0) {
        return res.status(404).json({
          message: "Barbershop ini belum memiliki staff terdaftar.",
        });
      }

      const allStaffIds = allStaff.map((s) => s.staff_id);
      const conflictingBookings = await Booking.findAll({
        where: {
          barbershop_id: barbershop_id,
          status: { [Op.ne]: "cancelled" },
          booking_time: { [Op.lt]: bookingEndTime },
          end_time: { [Op.gt]: bookingStartTime },
        },
      });

      const busyStaffIds = conflictingBookings.map((b) => b.staff_id);
      const availableStaff = allStaff.find(
        (staff) => !busyStaffIds.includes(staff.staff_id)
      );

      if (!availableStaff) {
        return res.status(409).json({
          message:
            "Maaf, semua staff sudah dipesan pada jam yang Anda pilih. Silakan pilih waktu lain.",
        });
      }

      staff_id = availableStaff.staff_id;
    }

    // ✅ BUAT BOOKING
    const newBooking = await Booking.create({
      customer_id: customerId,
      barbershop_id,
      service_id,
      staff_id,
      booking_time: bookingStartTime,
      end_time: bookingEndTime,
      total_price: service.price,
      status: "pending_payment",
      payment_status: "pending",
    });

    // ✅ GET CUSTOMER INFO
    const customer = await User.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer tidak ditemukan." });
    }

    // ✅ GENERATE MIDTRANS PAYMENT
    const orderId = `BOOK-${newBooking.booking_id}`;
    const grossAmount = parseInt(service.price);

    console.log("📄 Creating Midtrans transaction:", {
      orderId,
      grossAmount,
      customerName: customer.name,
      customerEmail: customer.email,
    });

    // ✅ GET URLs dari config
    const frontendUrl = getFrontendUrl();
    const notificationUrl = getNotificationUrl();

    console.log("🔗 Payment URLs:", {
      frontendUrl,
      notificationUrl,
    });

    const transactionDetails = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      credit_card: {
        secure: true,
      },
      customer_details: {
        first_name: customer.name,
        email: customer.email,
        phone: customer.phone_number,
      },
      item_details: [
        {
          id: service.service_id,
          price: grossAmount,
          quantity: 1,
          name: `${service.name} - ${barbershop.name}`,
        },
      ],
      callbacks: {
        // ✅ UNTUK SANDBOX MIDTRANS - langsung ke deep link
        finish: `potong://payment/success?order_id=${orderId}&booking_id=${newBooking.booking_id}`,
        error: `potong://payment/failed?order_id=${orderId}`,
        pending: `potong://payment/pending?order_id=${orderId}`,
      },
      // ✅ PENTING: Notification URL untuk webhook (via ngrok)
      custom_field1: notificationUrl,
    };

    let transaction;
    try {
      transaction = await snap.createTransaction(transactionDetails);
      console.log("✅ Midtrans transaction created:", transaction);
    } catch (midtransError) {
      console.error("❌ Midtrans Error:", midtransError);

      // Hapus booking jika Midtrans gagal
      await newBooking.destroy();

      return res.status(500).json({
        message: "Gagal membuat pembayaran. Silakan coba lagi.",
        error: midtransError.message,
      });
    }

    // ✅ UPDATE BOOKING DENGAN INFO PAYMENT
    await newBooking.update({
      payment_token: transaction.token,
      payment_url: transaction.redirect_url,
      transaction_id: orderId,
    });

    // ✅ KIRIM NOTIFIKASI
    try {
      await NotificationService.notifyBookingCreated(customerId, {
        serviceName: service.name,
        bookingId: newBooking.booking_id,
      });
    } catch (notifError) {
      console.error("⚠️ Notification error:", notifError);
    }

    // ✅ RESPONSE SUKSES
    res.status(201).json({
      message: "Booking berhasil dibuat. Silakan lanjutkan pembayaran.",
      booking: newBooking,
      payment: {
        token: transaction.token,
        redirect_url: transaction.redirect_url,
      },
    });
  } catch (error) {
    console.error("❌ CREATE BOOKING ERROR:", error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server.",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// ✅ WEBHOOK MIDTRANS
exports.handlePaymentNotification = async (req, res) => {
  try {
    console.log("🔥 Midtrans Notification received:", req.body);

    const { order_id, transaction_status, fraud_status } = req.body;

    const booking = await Booking.findOne({
      where: { transaction_id: order_id },
    });

    if (!booking) {
      console.error("❌ Booking not found for order_id:", order_id);
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    let paymentStatus = "pending";
    let bookingStatus = "pending_payment";

    // ✅ HANDLE PAYMENT STATUS
    if (
      transaction_status === "capture" ||
      transaction_status === "settlement"
    ) {
      if (fraud_status === "accept") {
        paymentStatus = "paid";
        bookingStatus = "confirmed";

        await booking.update({
          payment_status: paymentStatus,
          status: bookingStatus,
          paid_at: new Date(),
        });

        // Kirim notifikasi sukses
        try {
          const service = await Service.findByPk(booking.service_id);
          await NotificationService.notifyPaymentSuccess(booking.customer_id, {
            serviceName: service?.name || "Service",
            bookingId: booking.booking_id,
          });
        } catch (notifError) {
          console.error("⚠️ Notification error:", notifError);
        }

        console.log("✅ Payment confirmed for booking:", booking.booking_id);
      }
    } else if (
      transaction_status === "cancel" ||
      transaction_status === "deny" ||
      transaction_status === "expire"
    ) {
      paymentStatus = "failed";
      bookingStatus = "cancelled";

      await booking.update({
        payment_status: paymentStatus,
        status: bookingStatus,
      });

      console.log("❌ Payment failed for booking:", booking.booking_id);
    } else if (transaction_status === "pending") {
      paymentStatus = "pending";
      console.log("⏳ Payment pending for booking:", booking.booking_id);
    }

    res.status(200).json({ message: "Notification handled" });
  } catch (error) {
    console.error("❌ Payment notification error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ GET CUSTOMER BOOKINGS
exports.getMyBookings = async (req, res) => {
  try {
    const customerId = req.user.id;
    const bookings = await Booking.findAll({
      where: { customer_id: customerId },
      include: [
        { model: Service, attributes: ["name", "price", "duration_minutes"] },
        { model: Barbershop, attributes: ["name", "address", "city"] },
        { model: Staff, attributes: ["name"] },
      ],
      order: [["booking_time", "DESC"]],
    });
    res.status(200).json(bookings);
  } catch (error) {
    console.error("Get bookings error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ GET OWNER BOOKINGS
exports.getOwnerBookings = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;

    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const bookings = await Booking.findAll({
      where: { barbershop_id: barbershopId },
      include: [
        {
          model: User,
          as: "customer",
          attributes: ["name", "email", "phone_number"],
        },
        { model: Service, attributes: ["name", "price", "duration_minutes"] },
        { model: Staff, attributes: ["name"] },
      ],
      order: [["booking_time", "DESC"]],
    });

    res.status(200).json(bookings);
  } catch (error) {
    console.error("Get owner bookings error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ UPDATE BOOKING STATUS
exports.updateBookingStatus = async (req, res) => {
  try {
    const { barbershopId, bookingId } = req.params;
    const { status } = req.body;
    const ownerId = req.user.id;

    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const booking = await Booking.findOne({
      where: { booking_id: bookingId, barbershop_id: barbershopId },
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    await booking.update({ status });

    res
      .status(200)
      .json({ message: "Status booking berhasil diperbarui", booking });
  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
