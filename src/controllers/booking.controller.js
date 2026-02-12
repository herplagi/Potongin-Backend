// backend/src/controllers/booking.controller.js
const { Op } = require("sequelize");
const Booking = require("../models/Booking.model");
const Service = require("../models/Service.model");
const Staff = require("../models/Staff.model");
const Barbershop = require("../models/Barbershop.model");
const User = require("../models/User.model");
const { snap, getFrontendUrl, getNotificationUrl } = require("../config/midtrans.config");
const NotificationService = require("../services/notification.service");
const { 
    generateCheckInPIN, 
    generateQRToken, 
    validateCheckInTime,
    formatBookingResponse 
} = require("../helpers/bookingHelpers");

// ✅ CREATE BOOKING (existing - no change)
exports.createBooking = async (req, res) => {
  try {
    const customerId = req.user.id;
    let { barbershop_id, service_id, staff_id, booking_time } = req.body;

    if (!barbershop_id || !service_id || !booking_time) {
      return res.status(400).json({
        message: "Informasi booking tidak lengkap. Diperlukan: barbershop_id, service_id, booking_time",
      });
    }

    const service = await Service.findByPk(service_id);
    if (!service) {
      return res.status(404).json({ message: "Layanan tidak ditemukan." });
    }

    const barbershop = await Barbershop.findByPk(barbershop_id);
    if (!barbershop) {
      return res.status(404).json({ message: "Barbershop tidak ditemukan." });
    }

    const bookingStartTime = new Date(booking_time);
    const bookingEndTime = new Date(bookingStartTime.getTime() + service.duration_minutes * 60000);

    if (bookingStartTime < new Date()) {
      return res.status(400).json({ message: "Tidak dapat membuat booking di masa lalu." });
    }

    // Check staff availability (existing logic)
    if (staff_id) {
      const staff = await Staff.findByPk(staff_id);
      if (!staff) {
        return res.status(404).json({ message: "Staff tidak ditemukan." });
      }

      const conflictingBooking = await Booking.findOne({
        where: {
          staff_id: staff_id,
          status: { [Op.notIn]: ['cancelled', 'no_show'] },
          booking_time: { [Op.lt]: bookingEndTime },
          end_time: { [Op.gt]: bookingStartTime },
        },
      });

      if (conflictingBooking) {
        return res.status(409).json({
          message: "Jadwal untuk staff ini sudah dipesan. Silakan pilih waktu atau staff lain.",
        });
      }
    } else {
      // Auto-assign staff
      const allStaff = await Staff.findAll({ where: { barbershop_id, is_active: true } });
      if (!allStaff || allStaff.length === 0) {
        return res.status(404).json({
          message: "Barbershop ini belum memiliki staff terdaftar.",
        });
      }

      const conflictingBookings = await Booking.findAll({
        where: {
          barbershop_id: barbershop_id,
          status: { [Op.notIn]: ['cancelled', 'no_show'] },
          booking_time: { [Op.lt]: bookingEndTime },
          end_time: { [Op.gt]: bookingStartTime },
        },
      });

      const busyStaffIds = conflictingBookings.map((b) => b.staff_id);
      const availableStaff = allStaff.find((staff) => !busyStaffIds.includes(staff.staff_id));

      if (!availableStaff) {
        return res.status(409).json({
          message: "Maaf, semua staff sudah dipesan pada jam yang Anda pilih. Silakan pilih waktu lain.",
        });
      }

      staff_id = availableStaff.staff_id;
    }

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

    const customer = await User.findByPk(customerId);
    if (!customer) {
      return res.status(404).json({ message: "Customer tidak ditemukan." });
    }

    // Generate Midtrans payment
    const orderId = `BOOK-${newBooking.booking_id}`;
    const grossAmount = parseInt(service.price);
    const frontendUrl = getFrontendUrl();
    const notificationUrl = getNotificationUrl();

    const transactionDetails = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
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
          name: service.name,
        },
      ],
      callbacks: {
        finish: `${frontendUrl}/payment/finish?order_id=${orderId}`,
        error: `${frontendUrl}/payment/error?order_id=${orderId}`,
        pending: `${frontendUrl}/payment/pending?order_id=${orderId}`,
      },
    };

    try {
      const transaction = await snap.createTransaction(transactionDetails);
      
      await newBooking.update({
        payment_token: transaction.token,
        payment_url: transaction.redirect_url,
        transaction_id: orderId,
      });

      await NotificationService.sendBookingCreated(customerId, newBooking.booking_id);

      res.status(201).json({
        message: "Booking berhasil dibuat. Silakan lanjutkan pembayaran.",
        booking: formatBookingResponse(newBooking),
        payment: {
          token: transaction.token,
          redirect_url: transaction.redirect_url,
        },
      });
    } catch (midtransError) {
      console.error("❌ Midtrans error:", midtransError);
      await newBooking.destroy();
      return res.status(500).json({
        message: "Gagal membuat pembayaran. Silakan coba lagi.",
        error: midtransError.message,
      });
    }
  } catch (error) {
    console.error("❌ Create booking error:", error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server",
      error: error.message,
    });
  }
};

// ✅ HANDLE PAYMENT NOTIFICATION (UPDATE untuk generate check-in credentials)
exports.handlePaymentNotification = async (req, res) => {
  try {
    const { order_id, transaction_status, fraud_status } = req.body;

    console.log("📨 Payment notification received:", { order_id, transaction_status, fraud_status });

    const bookingId = order_id.replace("BOOK-", "");
    const booking = await Booking.findByPk(bookingId);

    if (!booking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    let paymentStatus = "pending";
    let bookingStatus = "pending_payment";

    if (transaction_status === "settlement" || transaction_status === "capture") {
      if (fraud_status === "accept" || !fraud_status) {
        paymentStatus = "paid";
        bookingStatus = "confirmed";
        
        // ✅ GENERATE CHECK-IN CREDENTIALS
        const pin = generateCheckInPIN();
        const qrToken = generateQRToken(booking.booking_id);
        
        console.log("🎫 Generated check-in credentials:", { pin, qrToken });
        
        await booking.update({
          payment_status: paymentStatus,
          status: bookingStatus,
          paid_at: new Date(),
          check_in_code: pin,
          qr_code_token: qrToken,
        });

        // ✅ KIRIM NOTIFIKASI dengan PIN dan QR
        await NotificationService.sendBookingConfirmed(
          booking.customer_id,
          booking.booking_id,
          { pin, qrToken }
        );

        console.log("✅ Booking confirmed with check-in credentials");
      }
    } else if (transaction_status === "pending") {
      paymentStatus = "pending";
      bookingStatus = "pending_payment";
    } else if (["deny", "cancel", "expire"].includes(transaction_status)) {
      paymentStatus = transaction_status === "expire" ? "expired" : "failed";
      bookingStatus = "cancelled";
      
      await booking.update({
        payment_status: paymentStatus,
        status: bookingStatus,
      });
    }

    res.status(200).json({ message: "Notification handled" });
  } catch (error) {
    console.error("❌ Payment notification error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ✅ GET CUSTOMER BOOKINGS (existing - add formatting)
exports.getMyBookings = async (req, res) => {
  try {
    const customerId = req.user.id;
    const bookings = await Booking.findAll({
      where: { customer_id: customerId },
      include: [
        { model: Service, attributes: ["name", "price", "duration_minutes"] },
        { model: Barbershop, attributes: ["name", "address", "city", "latitude", "longitude"] },
        { model: Staff, attributes: ["name", "picture"] },
      ],
      order: [["booking_time", "DESC"]],
    });
    
    const formattedBookings = bookings.map(b => formatBookingResponse(b));
    res.status(200).json(formattedBookings);
  } catch (error) {
    console.error("Get bookings error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ GET OWNER BOOKINGS (existing - add formatting)
exports.getOwnerBookings = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;

    console.log('📊 Fetching bookings for:', { barbershopId, ownerId });

    // Verify ownership
    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      console.log('❌ Access denied - barbershop not found or not owned by user');
      return res.status(403).json({ message: "Akses ditolak atau barbershop tidak ditemukan" });
    }

    console.log('✅ Barbershop verified:', barbershop.name);

    // Fetch bookings with all relations
    const bookings = await Booking.findAll({
      where: { barbershop_id: barbershopId },
      include: [
        {
          model: User,
          as: "customer",
          attributes: ["user_id", "name", "email", "phone_number"],
        },
        { 
          model: Service, 
          attributes: ["service_id", "name", "price", "duration_minutes"] 
        },
        { 
          model: Staff, 
          attributes: ["staff_id", "name"] 
        },
      ],
      order: [["booking_time", "DESC"]],
    });

    console.log(`✅ Found ${bookings.length} bookings`);

    // Format bookings with safe handling
    const formattedBookings = bookings.map(booking => {
      try {
        const bookingData = booking.toJSON();
        return {
          booking_id: bookingData.booking_id,
          customer_id: bookingData.customer_id,
          barbershop_id: bookingData.barbershop_id,
          service_id: bookingData.service_id,
          staff_id: bookingData.staff_id,
          booking_time: bookingData.booking_time,
          end_time: bookingData.end_time,
          status: bookingData.status,
          total_price: bookingData.total_price,
          payment_status: bookingData.payment_status,
          paid_at: bookingData.paid_at,
          
          // Check-in fields
          check_in_code: bookingData.check_in_code || null,
          qr_code_token: bookingData.qr_code_token || null,
          checked_in_at: bookingData.checked_in_at || null,
          check_in_method: bookingData.check_in_method || null,
          service_started_at: bookingData.service_started_at || null,
          service_completed_at: bookingData.service_completed_at || null,
          customer_confirmed_at: bookingData.customer_confirmed_at || null,
          
          // Relations
          customer: bookingData.customer || null,
          Service: bookingData.Service || null,
          Staff: bookingData.Staff || null,
          
          // Timestamps
          createdAt: bookingData.createdAt,
          updatedAt: bookingData.updatedAt,
          
          // Computed fields
          canCheckIn: bookingData.status === 'confirmed',
          canStart: bookingData.status === 'checked_in',
          canComplete: bookingData.status === 'in_progress',
          canConfirm: bookingData.status === 'awaiting_confirmation',
          canReview: bookingData.status === 'completed',
        };
      } catch (formatError) {
        console.error('❌ Error formatting booking:', booking.booking_id, formatError);
        return booking.toJSON(); // Return raw data if formatting fails
      }
    });

    console.log('✅ Bookings formatted successfully');
    res.status(200).json(formattedBookings);
    
  } catch (error) {
    console.error("❌ Get owner bookings error:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({ 
      message: "Server error", 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

// ✅✅✅ NEW: CUSTOMER CHECK-IN dengan QR CODE
exports.checkInWithQR = async (req, res) => {
  try {
    const { qrToken } = req.body;
    const customerId = req.user.id;

    if (!qrToken) {
      return res.status(400).json({ message: "QR token diperlukan" });
    }

    const booking = await Booking.findOne({
      where: {
        customer_id: customerId,
        qr_code_token: qrToken,
        status: "confirmed",
      },
      include: [
        { model: Barbershop, attributes: ["name", "address", "phone_number"] },
        { model: Service, attributes: ["name", "duration_minutes"] },
        { model: Staff, attributes: ["name"] },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        message: "QR Code tidak valid atau booking sudah check-in/dibatalkan",
      });
    }

    // Validasi waktu check-in
    const timeValidation = validateCheckInTime(booking.booking_time);
    
    if (!timeValidation.valid) {
      if (timeValidation.reason === 'too_late') {
        // Auto mark as no_show
        await booking.update({ status: "no_show" });
      }
      return res.status(400).json({ message: timeValidation.message });
    }

    // Update booking ke checked_in
    await booking.update({
      status: "checked_in",
      checked_in_at: new Date(),
      check_in_method: "qr_code",
    });

    // Notifikasi ke owner bahwa customer sudah check-in
    await NotificationService.sendCustomerCheckedIn(
      booking.barbershop_id,
      booking.booking_id,
      customerId
    );

    console.log(`✅ Customer ${customerId} checked in with QR for booking ${booking.booking_id}`);

    res.status(200).json({
      message: "Check-in berhasil! Silakan menunggu, staff akan segera melayani Anda.",
      booking: formatBookingResponse(booking),
    });
  } catch (error) {
    console.error("❌ Check-in QR error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅✅✅ NEW: CUSTOMER CHECK-IN dengan PIN
exports.checkInWithPIN = async (req, res) => {
  try {
    const { pin, barbershopId } = req.body;
    const customerId = req.user.id;

    if (!pin || !barbershopId) {
      return res.status(400).json({ message: "PIN dan barbershop ID diperlukan" });
    }

    const booking = await Booking.findOne({
      where: {
        customer_id: customerId,
        barbershop_id: barbershopId,
        check_in_code: pin,
        status: "confirmed",
      },
      include: [
        { model: Barbershop, attributes: ["name", "address"] },
        { model: Service, attributes: ["name"] },
        { model: Staff, attributes: ["name"] },
      ],
    });

    if (!booking) {
      return res.status(404).json({ 
        message: "PIN tidak valid atau booking tidak ditemukan" 
      });
    }

    // Validasi waktu
    const timeValidation = validateCheckInTime(booking.booking_time);
    
    if (!timeValidation.valid) {
      if (timeValidation.reason === 'too_late') {
        await booking.update({ status: "no_show" });
      }
      return res.status(400).json({ message: timeValidation.message });
    }

    await booking.update({
      status: "checked_in",
      checked_in_at: new Date(),
      check_in_method: "pin",
    });

    await NotificationService.sendCustomerCheckedIn(
      booking.barbershop_id,
      booking.booking_id,
      customerId
    );

    console.log(`✅ Customer ${customerId} checked in with PIN for booking ${booking.booking_id}`);

    res.status(200).json({
      message: "Check-in berhasil dengan PIN!",
      booking: formatBookingResponse(booking),
    });
  } catch (error) {
    console.error("❌ Check-in PIN error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅✅✅ NEW: OWNER START SERVICE
exports.startService = async (req, res) => {
  try {
    const { barbershopId, bookingId } = req.params;
    const ownerId = req.user.id;

    // Verify ownership
    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const booking = await Booking.findOne({
      where: {
        booking_id: bookingId,
        barbershop_id: barbershopId,
        status: "checked_in",
      },
      include: [
        { model: User, as: "customer", attributes: ["name"] },
        { model: Service, attributes: ["name"] },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking tidak ditemukan atau customer belum check-in",
      });
    }

    await booking.update({
      status: "in_progress",
      service_started_at: new Date(),
    });

    await NotificationService.sendServiceStarted(
      booking.customer_id,
      bookingId
    );

    console.log(`✅ Service started for booking ${bookingId}`);

    res.status(200).json({
      message: "Layanan dimulai",
      booking: formatBookingResponse(booking),
    });
  } catch (error) {
    console.error("❌ Start service error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅✅✅ NEW: OWNER COMPLETE SERVICE (tunggu konfirmasi customer)
exports.completeService = async (req, res) => {
  try {
    const { barbershopId, bookingId } = req.params;
    const ownerId = req.user.id;

    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const booking = await Booking.findOne({
      where: {
        booking_id: bookingId,
        barbershop_id: barbershopId,
        status: "in_progress",
      },
      include: [
        { model: User, as: "customer", attributes: ["name"] },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking tidak ditemukan atau layanan belum dimulai",
      });
    }

    await booking.update({
      status: "awaiting_confirmation",
      service_completed_at: new Date(),
    });

    // Notifikasi customer untuk konfirmasi
    await NotificationService.sendServiceCompleted(
      booking.customer_id,
      bookingId
    );

    console.log(`✅ Service completed for booking ${bookingId}, awaiting customer confirmation`);

    res.status(200).json({
      message: "Layanan selesai. Menunggu konfirmasi customer.",
      booking: formatBookingResponse(booking),
    });
  } catch (error) {
    console.error("❌ Complete service error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅✅✅ NEW: CUSTOMER CONFIRM SERVICE COMPLETED
exports.confirmServiceCompleted = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    const booking = await Booking.findOne({
      where: {
        booking_id: bookingId,
        customer_id: customerId,
        status: "awaiting_confirmation",
      },
      include: [
        { model: Barbershop, attributes: ["name"] },
        { model: Service, attributes: ["name"] },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking tidak ditemukan atau sudah dikonfirmasi",
      });
    }

    await booking.update({
      status: "completed",
      customer_confirmed_at: new Date(),
    });

    console.log(`✅ Customer confirmed completion for booking ${bookingId}`);

    res.status(200).json({
      message: "Terima kasih! Layanan telah dikonfirmasi selesai. Anda bisa memberikan ulasan sekarang.",
      booking: formatBookingResponse(booking),
      canReview: true,
    });
  } catch (error) {
    console.error("❌ Confirm service error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// ✅ UPDATE BOOKING STATUS (existing - keep for backward compatibility)
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

    res.status(200).json({
      message: "Status booking berhasil diperbarui",
      booking: formatBookingResponse(booking),
    });
  } catch (error) {
    console.error("Update booking status error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// ✅ EXPIRE PENDING BOOKINGS (existing - keep)
exports.expirePendingBookings = async () => {
  console.log("🔍 Memeriksa booking yang expired...");

  try {
    const expiredBookings = await Booking.findAll({
      where: {
        payment_status: "pending",
        status: "pending_payment",
        createdAt: {
          [Op.lt]: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    for (const booking of expiredBookings) {
      await booking.update({
        status: "cancelled",
        payment_status: "expired",
      });
      console.log(`❌ Booking ${booking.booking_id} expired`);
    }

    console.log(`✅ Checked ${expiredBookings.length} expired bookings`);
  } catch (error) {
    console.error("❌ Expire bookings error:", error);
  }
};

// ✅ CHECK AVAILABILITY - untuk BookingPage
// ✅ CHECK AVAILABILITY - untuk BookingPage
exports.checkAvailability = async (req, res) => {
  try {
    const { barbershop_id, date, time, service_id } = req.query;

    console.log('🔍 Checking availability:', { barbershop_id, date, time, service_id });

    if (!barbershop_id || !date) {
      return res.status(400).json({ 
        message: "barbershop_id dan date diperlukan" 
      });
    }

    // Get all staff for this barbershop
    const allStaff = await Staff.findAll({ 
      where: { barbershop_id, is_active: true } 
    });

    if (!allStaff || allStaff.length === 0) {
      return res.status(200).json({
        unavailable_staff_ids: [],
        fully_booked_times: [],
        message: "Tidak ada staff tersedia"
      });
    }

    // Get service duration (if service_id provided)
    let durationMinutes = 60; // default 1 hour
    if (service_id) {
      const service = await Service.findByPk(service_id);
      if (service) {
        durationMinutes = service.duration_minutes;
        console.log(`📏 Using service duration: ${durationMinutes} minutes`);
      }
    }

    // If time is specified, check which staff are unavailable at that time
    if (time) {
      const bookingDateTime = new Date(`${date}T${time}:00`);
      const bookingEndTime = new Date(bookingDateTime.getTime() + durationMinutes * 60000);

      const conflictingBookings = await Booking.findAll({
        where: {
          barbershop_id: barbershop_id,
          status: { [Op.notIn]: ['cancelled', 'no_show'] },
          booking_time: { [Op.lt]: bookingEndTime },
          end_time: { [Op.gt]: bookingDateTime },
        },
        attributes: ['staff_id']
      });

      const unavailableStaffIds = conflictingBookings.map(b => b.staff_id).filter(Boolean);

      console.log('✅ Unavailable staff at', time, ':', unavailableStaffIds);

      return res.status(200).json({
        unavailable_staff_ids: unavailableStaffIds,
        available_staff_count: allStaff.length - unavailableStaffIds.length,
      });
    }

    // If no time specified, return fully booked times for the date
    // Get all bookings for the date
    const startOfDay = new Date(`${date}T00:00:00`);
    const endOfDay = new Date(`${date}T23:59:59`);

    const bookingsForDay = await Booking.findAll({
      where: {
        barbershop_id: barbershop_id,
        status: { [Op.notIn]: ['cancelled', 'no_show'] },
        booking_time: {
          [Op.between]: [startOfDay, endOfDay]
        }
      },
      include: [
        { model: Service, attributes: ['duration_minutes'] }
      ],
      attributes: ['booking_id', 'booking_time', 'end_time', 'staff_id']
    });

    // Group bookings by time slots considering service duration
    const bookingsByTimeSlot = {};
    
    bookingsForDay.forEach(booking => {
      const bookingStart = new Date(booking.booking_time);
      const bookingEnd = new Date(booking.end_time);
      
      // Generate all time slots that this booking occupies
      let currentSlot = new Date(bookingStart);
      currentSlot.setMinutes(Math.floor(currentSlot.getMinutes() / 60) * 60); // Round to hour
      
      while (currentSlot < bookingEnd) {
        const timeSlot = currentSlot.toTimeString().substring(0, 5);
        if (!bookingsByTimeSlot[timeSlot]) {
          bookingsByTimeSlot[timeSlot] = new Set();
        }
        bookingsByTimeSlot[timeSlot].add(booking.staff_id);
        
        currentSlot.setMinutes(currentSlot.getMinutes() + 60); // Next hour slot
      }
    });

    // Find hours where all staff are booked
    const fullyBookedTimes = [];
    Object.keys(bookingsByTimeSlot).forEach(timeSlot => {
      const bookedStaffCount = bookingsByTimeSlot[timeSlot].size;
      if (bookedStaffCount >= allStaff.length) {
        fullyBookedTimes.push(timeSlot);
      }
    });

    console.log('✅ Fully booked times for', date, ':', fullyBookedTimes);

    return res.status(200).json({
      fully_booked_times: fullyBookedTimes,
      total_staff: allStaff.length,
    });

  } catch (error) {
    console.error('❌ Check availability error:', error);
    res.status(500).json({ 
      message: "Server error", 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined 
    });
  }
};

exports.rescheduleBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { new_booking_time } = req.body;
    const customerId = req.user.id;

    console.log('🔄 Reschedule request:', { bookingId, new_booking_time, customerId });

    if (!new_booking_time) {
      return res.status(400).json({ message: "Waktu booking baru diperlukan" });
    }

    // Find booking
    const booking = await Booking.findOne({
      where: {
        booking_id: bookingId,
        customer_id: customerId,
        status: 'confirmed',
      },
      include: [
        { model: Service, attributes: ['name', 'duration_minutes', 'price'] },
        { model: Barbershop, attributes: ['name'] },
      ],
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking tidak ditemukan atau tidak dapat di-reschedule",
      });
    }

    // Check if can reschedule
    const { canReschedule, shouldBeNoShow, isLateForCheckIn } = require('../helpers/bookingHelpers');
    
    if (shouldBeNoShow(booking)) {
      // Terlambat kedua kali - mark as no show
      await booking.update({ status: 'no_show' });
      
      await NotificationService.sendNoShowNotification(
        booking.barbershop_id,
        booking.booking_id
      );
      
      return res.status(400).json({
        message: "Booking Anda telah hangus karena terlambat check-in untuk kedua kalinya",
        status: 'no_show'
      });
    }

    if (!canReschedule(booking)) {
      return res.status(400).json({
        message: "Booking ini tidak dapat di-reschedule. Anda hanya dapat reschedule satu kali.",
      });
    }

    // Validate new booking time
    const newBookingStartTime = new Date(new_booking_time);
    const newBookingEndTime = new Date(newBookingStartTime.getTime() + booking.Service.duration_minutes * 60000);

    if (newBookingStartTime < new Date()) {
      return res.status(400).json({ message: "Tidak dapat reschedule ke waktu yang sudah lewat" });
    }

    // Check staff availability for new time
    const conflictingBooking = await Booking.findOne({
      where: {
        staff_id: booking.staff_id,
        status: { [Op.notIn]: ['cancelled', 'no_show'] },
        booking_time: { [Op.lt]: newBookingEndTime },
        end_time: { [Op.gt]: newBookingStartTime },
        booking_id: { [Op.ne]: bookingId }, // Exclude current booking
      },
    });

    if (conflictingBooking) {
      return res.status(409).json({
        message: "Staff tidak tersedia pada waktu yang dipilih. Silakan pilih waktu lain.",
      });
    }

    // Save original booking time if first reschedule
    const originalTime = booking.original_booking_time || booking.booking_time;

    // Update booking
    await booking.update({
      original_booking_time: originalTime,
      booking_time: newBookingStartTime,
      end_time: newBookingEndTime,
      reschedule_count: booking.reschedule_count + 1,
      reschedule_reason: 'late_checkin',
      // Regenerate check-in credentials
      check_in_code: generateCheckInPIN(),
      qr_code_token: generateQRToken(bookingId),
    });

    // Send notification
    await NotificationService.sendBookingRescheduled(
      customerId,
      bookingId,
      {
        oldTime: originalTime,
        newTime: newBookingStartTime,
        pin: booking.check_in_code,
        qrToken: booking.qr_code_token,
      }
    );

    console.log(`✅ Booking ${bookingId} rescheduled successfully`);

    res.status(200).json({
      message: "Booking berhasil di-reschedule. Ini adalah kesempatan terakhir Anda!",
      booking: formatBookingResponse(booking),
      warning: "Jika Anda terlambat lagi, booking akan otomatis dibatalkan (no-show).",
    });
  } catch (error) {
    console.error("❌ Reschedule booking error:", error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server",
      error: error.message,
    });
  }
};

// ✅✅✅ NEW: CHECK RESCHEDULE STATUS
exports.checkRescheduleStatus = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const customerId = req.user.id;

    const booking = await Booking.findOne({
      where: {
        booking_id: bookingId,
        customer_id: customerId,
      },
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking tidak ditemukan" });
    }

    const { canReschedule, shouldBeNoShow, isLateForCheckIn } = require('../helpers/bookingHelpers');

    res.status(200).json({
      can_reschedule: canReschedule(booking),
      should_be_no_show: shouldBeNoShow(booking),
      is_late: isLateForCheckIn(booking.booking_time),
      reschedule_count: booking.reschedule_count,
      status: booking.status,
    });
  } catch (error) {
    console.error("❌ Check reschedule status error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

module.exports = exports;