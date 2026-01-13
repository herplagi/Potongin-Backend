const { Op } = require("sequelize");
const Booking = require("../models/Booking.model");
const Service = require("../models/Service.model");
const Staff = require("../models/Staff.model");
const Barbershop = require("../models/Barbershop.model");
const User = require("../models/User.model");
const { core } = require("../config/midtrans.config");
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
      console.log("📤 Memicu notifikasi ke owner...");
      await NotificationService.notifyOwnerNewBooking(barbershop.barbershop_id, {
        bookingId: newBooking.booking_id,
        serviceName: service.name,
        customerName: customer?.name || "Customer", 
        bookingTime: newBooking.booking_time,
      });
      console.log("📬 Notifikasi ke owner telah dipicu.");
    } catch (notifError) {
      console.error("⚠️ Gagal mengirim notifikasi ke owner:", notifError);
      
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

exports.expirePendingBookings = async () => {
    console.log('🔍 Memeriksa booking yang expired...');

    try {
        const now = new Date();
        // Batas waktu: 15 menit dalam milidetik
        const cutoffTime = new Date(now.getTime() - (15 * 60 * 1000));

        // Cari booking yang statusnya pending_payment dan dibuat sebelum cutoffTime
        const pendingBookings = await Booking.findAll({
            where: {
                status: 'pending_payment',
                createdAt: { [Op.lt]: cutoffTime }
            }
        });

        console.log(`📅 Menemukan ${pendingBookings.length} booking yang mungkin expired.`);

        for (const booking of pendingBookings) {
            console.log(`🔍 Memeriksa booking ${booking.booking_id} dengan transaction_id ${booking.transaction_id}...`);

            try {
                // Cek status pembayaran ke Midtrans
                const midtransStatus = await core.transaction.status(booking.transaction_id);
                console.log(`📊 Status Midtrans untuk ${booking.transaction_id}:`, midtransStatus.transaction_status);

                // Jika status bukan settlement (berhasil) atau capture (berhasil), maka kita anggap pembayaran tidak selesai
                if (midtransStatus.transaction_status !== 'settlement' && midtransStatus.transaction_status !== 'capture') {
                    console.log(`❌ Pembayaran untuk booking ${booking.booking_id} belum selesai (status: ${midtransStatus.transaction_status}). Booking dibatalkan.`);

                    // Update status booking menjadi 'cancelled' atau 'expired'
                    await booking.update({
                        status: 'cancelled', // Ganti ke 'expired' jika kamu menambahkan enum itu
                        payment_status: 'expired' // Update payment status juga
                    });

                    // --- KEMBALIKAN SLOT WAKTU ---
                    // Karena kamu menggunakan tabel Booking untuk mengecek konflik di createBooking,
                    // mengubah status ke 'cancelled' sudah cukup agar slot tersebut bisa dipesan kembali.
                    // Jika kamu memiliki tabel atau kolom khusus untuk slot waktu, kamu perlu menambahkan logika untuk mengupdate status slot tersebut agar bisa dipesan kembali.

                    console.log(`✅ Booking ${booking.booking_id} telah diupdate menjadi cancelled/expired.`);

                    // Kirim notifikasi ke customer bahwa bookingnya dibatalkan karena pembayaran tidak selesai
                    // await NotificationService.notifyBookingExpired(booking.customer_id, { bookingId: booking.booking_id });

                } else {
                    console.log(`✅ Pembayaran untuk booking ${booking.booking_id} sudah selesai (status: ${midtransStatus.transaction_status}). Tidak ada perubahan status.`);
                }
            } catch (midtransError) {
                // --- PENANGANAN ERROR DARI MIDTRANS ---
                console.log(`🔍 Menerima error saat mengecek status untuk booking ${booking.booking_id}:`, midtransError.message || midtransError.name);

                // --- PERUBAHAN UTAMA: Perbaiki pengecekan error 404 ---
                // Midtrans API bisa mengembalikan httpStatusCode sebagai string atau number.
                // Gunakan parseInt untuk memastikan perbandingan angka dengan angka.
                const statusCode = parseInt(midtransError.httpStatusCode, 10);

                if (statusCode === 404) {
                    console.log(`⚠️ Transaksi ${booking.transaction_id} tidak ditemukan di Midtrans (404). Asumsikan expired.`);
                    // Jika Midtrans mengatakan transaksi tidak ada, kita asumsikan pembayaran tidak selesai/expired.
                    // Update status booking menjadi 'cancelled' karena Midtrans tidak bisa mengonfirmasi pembayaran.
                    try {
                        await booking.update({
                            status: 'cancelled',
                            payment_status: 'expired'
                        });
                        console.log(`✅ Booking ${booking.booking_id} (transaksi hilang) telah diupdate menjadi cancelled/expired.`);
                        // Kirim notifikasi ke customer
                        // await NotificationService.notifyBookingExpired(booking.customer_id, { bookingId: booking.booking_id });
                    } catch (updateDbError) {
                        console.error(`❌ Gagal mengupdate status booking ${booking.booking_id} di database setelah error 404:`, updateDbError);
                    }
                } else {
                    // Jika error bukan 404 (misalnya 500, timeout, dll), log dan lanjutkan ke booking berikutnya
                    // Jangan batalkan booking hanya karena error sementara dari Midtrans
                    console.error(`❌ Gagal mengambil status Midtrans untuk ${booking.transaction_id}. Error Code: ${statusCode || 'N/A'}`, midtransError);
                    // Kamu bisa pilih untuk mengirim notifikasi error ke admin atau log ke sistem monitoring
                    // Tapi untuk cron ini, kita lanjutkan ke booking berikutnya
                }
                // --- AKHIR PERUBAHAN UTAMA ---
            }
        }

        console.log('✅ Pemeriksaan booking expired selesai.');

    } catch (error) {
        console.error('❌ Error saat memeriksa booking expired:', error);
    }
};

// ✅ GET UPCOMING BOOKINGS
exports.getUpcomingBookings = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user;
    
    // Extract query parameters for filtering and pagination
    const { 
      page = 1, 
      limit = 10, 
      date, 
      service_id, 
      city 
    } = req.query;

    // Calculate pagination offset
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build base where clause for upcoming bookings
    const whereClause = {
      booking_time: { [Op.gte]: new Date() }, // Only future bookings
      status: { [Op.ne]: 'cancelled' } // Exclude cancelled bookings
    };

    // Apply role-based filtering
    if (userRole.is_customer && !userRole.is_owner) {
      // Customers only see their own bookings
      whereClause.customer_id = userId;
    } else if (userRole.is_owner) {
      // Owners see bookings for their barbershops
      const ownerBarbershops = await Barbershop.findAll({
        where: { owner_id: userId },
        attributes: ['barbershop_id']
      });
      
      if (ownerBarbershops.length === 0) {
        return res.status(200).json({
          bookings: [],
          pagination: {
            total: 0,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: 0
          }
        });
      }
      
      whereClause.barbershop_id = {
        [Op.in]: ownerBarbershops.map(b => b.barbershop_id)
      };
    }

    // Apply optional filters
    if (date) {
      // Filter by specific date
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);
      
      whereClause.booking_time = {
        [Op.between]: [startOfDay, endOfDay]
      };
    }

    if (service_id) {
      whereClause.service_id = service_id;
    }

    // Build include clause for related data
    const includeClause = [
      {
        model: Service,
        attributes: ['service_id', 'name', 'price', 'duration_minutes'],
        required: true
      },
      {
        model: Barbershop,
        attributes: ['barbershop_id', 'name', 'address', 'city'],
        required: true,
        ...(city && {
          where: { city: { [Op.like]: `%${city}%` } }
        })
      },
      {
        model: Staff,
        attributes: ['staff_id', 'name', 'specialty'],
        required: false
      }
    ];

    // Add customer info for owners
    if (userRole.is_owner) {
      includeClause.push({
        model: User,
        as: 'customer',
        attributes: ['user_id', 'name', 'email', 'phone_number']
      });
    }

    // Get total count for pagination
    const totalCount = await Booking.count({
      where: whereClause,
      include: city ? [{
        model: Barbershop,
        attributes: [],
        where: { city: { [Op.like]: `%${city}%` } }
      }] : []
    });

    // Fetch bookings with pagination
    const bookings = await Booking.findAll({
      where: whereClause,
      include: includeClause,
      order: [['booking_time', 'ASC']],
      limit: parseInt(limit),
      offset: offset
    });

    res.status(200).json({
      bookings,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalCount / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get upcoming bookings error:', error);
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

exports.checkStaffAvailability = async (req, res) => {
    try {
        const { barbershop_id, date, time } = req.query;

        console.log('🔍 CHECK AVAILABILITY REQUEST:', { barbershop_id, date, time });

        // Validasi parameter dasar
        if (!barbershop_id || !date) {
            return res.status(400).json({ message: 'Parameter barbershop_id dan date wajib disertakan.' });
        }

        // Validasi format tanggal
        const parsedDate = new Date(date);
        if (isNaN(parsedDate.getTime())) {
            return res.status(400).json({ message: 'Format tanggal tidak valid.' });
        }
        const formattedDate = parsedDate.toISOString().split('T')[0];

        // --- LOGIKA UNTUK MENCARI WAKTU PENUH (SEMUA STAFF DIBOOKING) ---
        if (!time) {
            console.log(`📅 Memeriksa waktu penuh untuk barbershop ${barbershop_id} pada tanggal ${formattedDate}`);
            
            try {
                // 1. Dapatkan HANYA staff yang AKTIF di barbershop
                const activeStaff = await Staff.findAll({ 
                    where: { 
                        barbershop_id,
                        is_active: true  // ✅ FILTER HANYA STAFF AKTIF
                    },
                    attributes: ['staff_id', 'name']
                });
                
                if (!activeStaff || activeStaff.length === 0) {
                    console.log("❌ Tidak ada staff AKTIF di barbershop ini!");
                    return res.status(200).json({ fully_booked_times: [] }); 
                }
                
                const totalActiveStaffCount = activeStaff.length;
                console.log(`👨‍💼 Total staff AKTIF: ${totalActiveStaffCount}`, activeStaff.map(s => s.name));

                // 2. Dapatkan jam buka barbershop untuk tanggal tersebut
                const barbershopDetails = await Barbershop.findByPk(barbershop_id);
                if (!barbershopDetails) {
                    return res.status(404).json({ message: 'Barbershop tidak ditemukan.' });
                }

                const dayOfWeek = new Date(formattedDate).toLocaleDateString('id-ID', { weekday: 'long' });
                let hoursObject;
                try {
                    hoursObject = typeof barbershopDetails.opening_hours === 'string' 
                        ? JSON.parse(barbershopDetails.opening_hours) 
                        : barbershopDetails.opening_hours;
                } catch (e) {
                    console.error('❌ Error parsing opening_hours:', e);
                    return res.status(500).json({ message: 'Data jam buka barbershop tidak valid.' });
                }

                const dayInfo = hoursObject[dayOfWeek];
                if (!dayInfo || !dayInfo.aktif) {
                    console.log(`🚫 Barbershop tutup pada hari ${dayOfWeek}`);
                    return res.status(200).json({ fully_booked_times: [] });
                }

                const startHour = dayInfo.buka;
                const endHour = dayInfo.tutup;
                const intervalMinutes = 60;

                console.log(`⏰ Jam operasional ${dayOfWeek}: ${startHour} - ${endHour}`);

                // 3. Buat daftar slot waktu berdasarkan jam buka
                const timeSlots = generateTimeSlots(startHour, endHour, intervalMinutes);
                console.log(`🕒 Slot waktu: ${timeSlots.length} slots`);

                const fullyBookedTimes = [];
                const activeStaffIds = activeStaff.map(s => s.staff_id);

                // 4. Untuk setiap slot waktu, hitung staff AKTIF yang tersedia
                for (const slotTime of timeSlots) {
                    const slotDateTimeStart = new Date(`${formattedDate}T${slotTime}:00+07:00`);
                    const slotDateTimeEnd = new Date(slotDateTimeStart.getTime() + intervalMinutes * 60000);

                    // ✅ HANYA CEK BOOKING UNTUK STAFF YANG AKTIF
                    const conflictingBookings = await Booking.findAll({
                        where: {
                            barbershop_id: barbershop_id,
                            staff_id: { [Op.in]: activeStaffIds },  // ✅ FILTER STAFF AKTIF
                            status: { [Op.ne]: "cancelled" },
                            booking_time: { [Op.lt]: slotDateTimeEnd },
                            end_time: { [Op.gt]: slotDateTimeStart },
                        },
                        attributes: ['staff_id', 'booking_id'],
                    });

                    const busyStaffCount = conflictingBookings.length;
                    console.log(`🕒 Slot ${slotTime}: ${busyStaffCount}/${totalActiveStaffCount} staff aktif sibuk`);

                    // Jika SEMUA staff AKTIF sibuk, waktu ini penuh
                    if (busyStaffCount >= totalActiveStaffCount) {
                        fullyBookedTimes.push(slotTime);
                        console.log(`🔴 Slot ${slotTime} PENUH (semua staff aktif sibuk)`);
                    }
                }

                console.log("✅ Waktu penuh yang ditemukan:", fullyBookedTimes);
                return res.status(200).json({ 
                    fully_booked_times: fullyBookedTimes,
                    total_active_staff: totalActiveStaffCount,
                    active_staff: activeStaff.map(s => ({ id: s.staff_id, name: s.name }))
                });
                
            } catch (dbError) {
                console.error("❌ Error saat mencari waktu penuh:", dbError);
                return res.status(500).json({ message: 'Gagal memeriksa ketersediaan waktu.', error: dbError.message });
            }
        }
        // --- AKHIR LOGIKA UNTUK MENCARI WAKTU PENUH ---

        // --- LOGIKA UNTUK MENCARI STAFF YANG TIDAK TERSEDIA (UNTUK WAKTU SPESIFIK) ---
        
        // Validasi format waktu
        const bookingDateTime = new Date(`${formattedDate}T${time}:00+07:00`);
        if (isNaN(bookingDateTime.getTime())) {
            return res.status(400).json({ message: 'Format waktu tidak valid.' });
        }

        console.log(`🔍 Memeriksa ketersediaan staff untuk ${formattedDate} ${time}`);

        const durationInMinutes = 60;
        const bookingStartTime = bookingDateTime;
        const bookingEndTime = new Date(bookingStartTime.getTime() + durationInMinutes * 60000);

        // Ambil HANYA staff yang AKTIF
        const allActiveStaff = await Staff.findAll({ 
            where: { 
                barbershop_id,
                is_active: true  // ✅ FILTER HANYA STAFF AKTIF
            },
            attributes: ['staff_id', 'name']
        });

        if (!allActiveStaff || allActiveStaff.length === 0) {
            return res.status(404).json({ 
                message: 'Barbershop ini belum memiliki staff AKTIF.', 
                unavailable_staff_ids: [] 
            });
        }

        console.log(`👨‍💼 Staff aktif di barbershop: ${allActiveStaff.length}`, allActiveStaff.map(s => s.name));

        const activeStaffIds = allActiveStaff.map(s => s.staff_id);

        // Cari booking yang konflik HANYA untuk staff yang AKTIF
        const conflictingBookings = await Booking.findAll({
            where: {
                barbershop_id: barbershop_id,
                staff_id: { [Op.in]: activeStaffIds },  // ✅ FILTER STAFF AKTIF
                status: { [Op.ne]: "cancelled" },
                booking_time: { [Op.lt]: bookingEndTime },
                end_time: { [Op.gt]: bookingStartTime },
            },
            attributes: ['staff_id', 'booking_id'],
        });

        const busyStaffIds = conflictingBookings.map(b => b.staff_id);
        console.log(`👨‍🔧 Staff AKTIF yang tidak tersedia:`, busyStaffIds);

        res.status(200).json({
            unavailable_staff_ids: busyStaffIds,
            total_active_staff: allActiveStaff.length,
            available_staff_count: allActiveStaff.length - busyStaffIds.length
        });

    } catch (error) {
        console.error("❌ Check staff availability error:", error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

function generateTimeSlots(start, end, intervalMinutes) {
  const slots = [];
  let currentTime = new Date(`1970-01-01T${start}:00`);
  const endTime = new Date(`1970-01-01T${end}:00`);

  while (currentTime < endTime) {
    slots.push(currentTime.toTimeString().substring(0, 5));
    currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
  }
  return slots;
}


function generateTimeSlots(start, end, intervalMinutes) {
  const slots = [];
  let currentTime = new Date(`1970-01-01T${start}:00`);
  const endTime = new Date(`1970-01-01T${end}:00`);

  while (currentTime < endTime) {
    slots.push(currentTime.toTimeString().substring(0, 5));
    currentTime.setMinutes(currentTime.getMinutes() + intervalMinutes);
  }
  return slots;
}

