const sequelize = require("../config/database");
const { Op } = require("sequelize");
const fs = require("fs");
const path = require("path");
const { startOfDay, endOfDay, startOfMonth, endOfMonth } = require("date-fns");

// Impor semua model yang dibutuhkan
const Barbershop = require("../models/Barbershop.model");
const User = require("../models/User.model");
const Service = require("../models/Service.model");
const Staff = require("../models/Staff.model");
const Booking = require("../models/Booking.model");

// =================================================================
// --- FUNGSI UNTUK PUBLIK (Dipanggil oleh Customer App) ---
// =================================================================

// exports.getAllApprovedBarbershops = async (req, res) => {
//     try {
//         const barbershops = await Barbershop.findAll({
//             where: { approval_status: 'approved' },
//             attributes: ['barbershop_id', 'name', 'address', 'city', 'main_image_url'],
//         });
//         res.status(200).json(barbershops);
//     } catch (error) {
//         res.status(500).json({ message: "Server Error", error: error.message });
//     }
// };

exports.getAllApprovedBarbershops = async (req, res) => {
  try {
    const { latitude, longitude, max_distance } = req.query;

    // Jika koordinat dan jarak maksimum diberikan → cari berdasarkan jarak
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const maxDist = max_distance
        ? Math.max(parseFloat(max_distance), 0)
        : 0.5; // default 500 meter = 0.5 km

      if (
        isNaN(lat) ||
        isNaN(lon) ||
        isNaN(maxDist) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        return res.status(400).json({
          message: "Parameter latitude, longitude, atau max_distance tidak valid.",
        });
      }

      // 🔍 Raw query dengan agregasi review
      const rawQuery = `
        SELECT 
          b.*,
          (6371 * acos(
            cos(radians(:lat)) *
            cos(radians(CAST(b.latitude AS DECIMAL(10,8)))) *
            cos(radians(CAST(b.longitude AS DECIMAL(11,8))) - radians(:lon)) +
            sin(radians(:lat)) *
            sin(radians(CAST(b.latitude AS DECIMAL(10,8))))
          )) AS distance_km,
          COALESCE(r_stats.avg_rating, 0) AS average_rating,
          COALESCE(r_stats.review_count, 0) AS review_count
        FROM barbershops b
        LEFT JOIN (
          SELECT 
            barbershop_id,
            AVG(rating) AS avg_rating,
            COUNT(review_id) AS review_count
          FROM reviews
          WHERE status = 'approved'
          GROUP BY barbershop_id
        ) r_stats ON b.barbershop_id = r_stats.barbershop_id
        WHERE b.approval_status = 'approved'
          AND b.latitude IS NOT NULL
          AND b.longitude IS NOT NULL
        HAVING distance_km <= :maxDist
        ORDER BY distance_km ASC;
      `;

      const rawResults = await sequelize.query(rawQuery, {
        replacements: { lat, lon, maxDist },
        type: sequelize.QueryTypes.SELECT,
      });

      const resultsWithDistance = rawResults.map((shop) => {
        const {
          latitude,
          longitude,
          distance_km,
          average_rating,
          review_count,
          ...filteredShop
        } = shop;

        // Opsional: hapus koordinat dari respons untuk keamanan/kebersihan
        delete filteredShop.latitude;
        delete filteredShop.longitude;

        return {
          ...filteredShop,
          distance_km: parseFloat(parseFloat(distance_km).toFixed(2)),
          average_rating: parseFloat(parseFloat(average_rating).toFixed(1)),
          review_count: parseInt(review_count, 10) || 0,
        };
      });

      return res.status(200).json(resultsWithDistance);
    }

    // 📋 Jika TIDAK ada koordinat → ambil semua barbershop approved + review stats
    const rawQueryAll = `
      SELECT 
        b.*,
        COALESCE(r_stats.avg_rating, 0) AS average_rating,
        COALESCE(r_stats.review_count, 0) AS review_count
      FROM barbershops b
      LEFT JOIN (
        SELECT 
          barbershop_id,
          AVG(rating) AS avg_rating,
          COUNT(review_id) AS review_count
        FROM reviews
        WHERE status = 'approved'
        GROUP BY barbershop_id
      ) r_stats ON b.barbershop_id = r_stats.barbershop_id
      WHERE b.approval_status = 'approved'
      ORDER BY b.createdAt DESC;
    `;

    const rawResultsAll = await sequelize.query(rawQueryAll, {
      type: sequelize.QueryTypes.SELECT,
    });

    const resultsAll = rawResultsAll.map((shop) => {
      const { latitude, longitude, average_rating, review_count, ...filteredShop } = shop;

      // Opsional: hapus koordinat
      delete filteredShop.latitude;
      delete filteredShop.longitude;

      return {
        ...filteredShop,
        average_rating: parseFloat(parseFloat(average_rating).toFixed(1)),
        review_count: parseInt(review_count, 10) || 0,
      };
    });

    res.status(200).json(resultsAll);
  } catch (error) {
    console.error("GET ALL BARBERSHOPS ERROR:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getBarbershopDetailsById = async (req, res) => {
  try {
    const { id } = req.params;
    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: id, approval_status: "approved" },
      include: [
        {
          model: Service,
          as: "services",
          where: { is_active: true },
          required: false,
        },
        { 
          model: Staff, 
          as: "staff", 
          where: { is_active: true }, // ✅ FILTER HANYA STAFF AKTIF
          required: false 
        },
      ],
    });
    if (!barbershop) {
      return res
        .status(404)
        .json({ message: "Barbershop tidak ditemukan atau belum disetujui." });
    }
    res.status(200).json(barbershop);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};


// =================================================================
// --- FUNGSI UNTUK CUSTOMER / PENDAFTARAN ---
// =================================================================

exports.registerBarbershop = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const userId = req.user.id;
    const { name, address, city, opening_hours } = req.body;

    if (!name || !address || !city || !req.files) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: "Semua data dan file wajib diisi." });
    }

    const ktpUrl = `/uploads/documents/${req.files.ktp[0].filename}`;
    const permitUrl = `/uploads/documents/${req.files.permit[0].filename}`;
    const parsedOpeningHours = JSON.parse(opening_hours);

    const newBarbershop = await Barbershop.create(
      {
        owner_id: userId,
        name,
        address,
        city,
        opening_hours: parsedOpeningHours,
        ktp_url: ktpUrl,
        permit_url: permitUrl,
      },
      { transaction: t }
    );

    await t.commit();
    res
      .status(201)
      .json({
        message: "Pendaftaran barbershop berhasil.",
        barbershop: newBarbershop,
      });
  } catch (error) {
    await t.rollback();
    console.error("REGISTER BARBERSHOP ERROR:", error);
    res.status(500).json({ message: "Terjadi kesalahan pada server." });
  }
};

exports.getMyApplicationStatus = async (req, res) => {
  try {
    const applications = await Barbershop.findAll({
      where: { owner_id: req.user.id },
      order: [["createdAt", "DESC"]],
    });
    if (!applications || applications.length === 0) {
      return res
        .status(404)
        .json({ message: "Anda belum memiliki pendaftaran barbershop." });
    }
    res.status(200).json(applications);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// =================================================================
// --- FUNGSI KHUSUS UNTUK OWNER ---
// =================================================================

exports.getMyBarbershops = async (req, res) => {
  try {
    const barbershops = await Barbershop.findAll({
      where: { owner_id: req.user.id },
    });
    res.status(200).json(barbershops);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getMyBarbershopById = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { barbershopId } = req.params;
    const barbershop = await Barbershop.findOne({
      where: {
        barbershop_id: barbershopId,
        owner_id: ownerId,
      },
    });
    if (!barbershop) {
      return res
        .status(404)
        .json({
          message:
            "Barbershop tidak ditemukan atau Anda tidak punya hak akses.",
        });
    }
    res.status(200).json(barbershop);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.updateMyBarbershop = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;
    const {
      name,
      address,
      city,
      opening_hours,
      latitude,
      longitude,
      description,
    } = req.body;

    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
      transaction: t,
    });

    if (!barbershop) {
      await t.rollback();
      return res
        .status(404)
        .json({
          message:
            "Barbershop tidak ditemukan atau Anda tidak punya hak akses.",
        });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (opening_hours !== undefined) {
      updateData.opening_hours = JSON.parse(opening_hours);
    }
    // --- TAMBAHKAN LOGIKA UNTUK LATITUDE DAN LONGITUDE ---
    if (latitude !== undefined) {
      const lat = parseFloat(latitude);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        await t.rollback();
        return res.status(400).json({ message: "Latitude tidak valid." });
      }
      updateData.latitude = lat;
    }
    if (longitude !== undefined) {
      const lon = parseFloat(longitude);
      if (isNaN(lon) || lon < -180 || lon > 180) {
        await t.rollback();
        return res.status(400).json({ message: "Longitude tidak valid." });
      }
      updateData.longitude = lon;
    }
    // --- TAMBAHKAN LOGIKA UNTUK DESCRIPTION ---
    if (description !== undefined) {
      // Izinkan description kosong/null
      updateData.description = description || null;
    }

    if (req.files) {
      if (req.files.ktp) {
        if (barbershop.ktp_url)
          fs.unlink(
            path.join(__dirname, "../../public", barbershop.ktp_url),
            () => {}
          );
        updateData.ktp_url = `/uploads/documents/${req.files.ktp[0].filename}`;
      }
      if (req.files.permit) {
        if (barbershop.permit_url)
          fs.unlink(
            path.join(__dirname, "../../public", barbershop.permit_url),
            () => {}
          );
        updateData.permit_url = `/uploads/documents/${req.files.permit[0].filename}`;
      }
    }

    updateData.approval_status = "pending";
    updateData.rejection_reason = null;
    updateData.verified_by = null;

    await barbershop.update(updateData, { transaction: t });

    await t.commit();
    res
      .status(200)
      .json({
        message: "Data barbershop berhasil diperbarui dan diajukan ulang.",
        barbershop,
      });
  } catch (error) {
    await t.rollback();
    console.error("UPDATE BARBERSHOP ERROR:", error);
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server", error: error.message });
  }
};

exports.getBarbershopKpis = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { barbershopId } = req.params;

    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      return res.status(403).json({ message: "Akses ditolak." });
    }

    const now = new Date();
    
    // Get data untuk 7 hari terakhir untuk chart
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6); // 6 hari yang lalu + hari ini = 7 hari
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Query untuk mendapatkan pendapatan per hari
    const weeklyRevenue = await Booking.findAll({
      where: {
        barbershop_id: barbershopId,
        status: "completed",
        payment_status: "paid",
        paid_at: {
          [Op.gte]: sevenDaysAgo,
        },
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('paid_at')), 'date'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'revenue'],
      ],
      group: [sequelize.fn('DATE', sequelize.col('paid_at'))],
      order: [[sequelize.fn('DATE', sequelize.col('paid_at')), 'ASC']],
      raw: true,
    });

    // Format data untuk chart - pastikan semua 7 hari ada
    const chartData = [];
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(sevenDaysAgo);
      date.setDate(sevenDaysAgo.getDate() + i);
      const dateString = date.toISOString().split('T')[0];
      const dayName = dayNames[date.getDay()];
      
      // Cari revenue untuk tanggal ini
      const dayRevenue = weeklyRevenue.find(r => r.date === dateString);
      
      chartData.push({
        name: dayName,
        Pendapatan: dayRevenue ? parseFloat(dayRevenue.revenue) : 0,
        date: dateString,
      });
    }

    const [revenueToday, bookingsToday, upcomingBookings, serviceCount] =
      await Promise.all([
        Booking.sum("total_price", {
          where: {
            barbershop_id: barbershopId,
            status: "completed",
            updatedAt: {
              [Op.between]: [startOfDay(now), endOfDay(now)],
            },
          },
        }),
        Booking.count({
          where: {
            barbershop_id: barbershopId,
            createdAt: {
              [Op.between]: [startOfDay(now), endOfDay(now)],
            },
          },
        }),
        Booking.count({
          where: {
            barbershop_id: barbershopId,
            booking_time: { [Op.gte]: now },
            status: { [Op.notIn]: ["cancelled", "completed"] },
          },
        }),
        Service.count({
          where: {
            barbershop_id: barbershopId,
            is_active: true,
          },
        }),
      ]);

    res.status(200).json({
      revenueToday: revenueToday || 0,
      bookingsToday: bookingsToday || 0,
      upcomingBookings: upcomingBookings || 0,
      serviceCount: serviceCount || 0,
      weeklyChart: chartData, // ✅ Tambahkan data chart
    });
  } catch (error) {
    console.error("GET KPI ERROR:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.resubmitBarbershop = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { barbershopId } = req.params;

    const barbershop = await Barbershop.findOne({
      where: { owner_id: ownerId, barbershop_id: barbershopId },
    });
    if (!barbershop) {
      return res
        .status(404)
        .json({
          message:
            "Barbershop tidak ditemukan atau Anda tidak punya hak akses.",
        });
    }
    if (barbershop.approval_status !== "rejected") {
      return res
        .status(400)
        .json({
          message: "Hanya barbershop yang ditolak yang bisa diajukan ulang.",
        });
    }

    await barbershop.update({
      approval_status: "pending",
      rejection_reason: null,
      verified_by: null,
    });

    res
      .status(200)
      .json({ message: "Barbershop berhasil diajukan ulang.", barbershop });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.uploadMainImage = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;

    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      return res.status(404).json({ message: "Barbershop tidak ditemukan" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File gambar tidak ditemukan" });
    }

    // Hapus gambar lama jika ada
    if (barbershop.main_image_url) {
      const oldImagePath = path.join(
        __dirname,
        "../../public",
        barbershop.main_image_url
      );
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    const imageUrl = `/uploads/barbershop-images/${req.file.filename}`;
    await barbershop.update({ main_image_url: imageUrl });

    res.status(200).json({
      message: "Gambar berhasil diupload",
      image_url: imageUrl,
    });
  } catch (error) {
    console.error("Upload image error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get gallery images (untuk fitur masa depan)
exports.getGalleryImages = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const barbershop = await Barbershop.findByPk(barbershopId);

    if (!barbershop) {
      return res.status(404).json({ message: "Barbershop tidak ditemukan" });
    }

    // Untuk saat ini hanya return main image
    // Nanti bisa dikembangkan untuk multiple images
    res.status(200).json({
      main_image: barbershop.main_image_url,
      gallery: [], // untuk fitur masa depan
    });
  } catch (error) {
    console.error("Get gallery error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.updateBarbershopLocation = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;
    const { latitude, longitude } = req.body;

    console.log('📍 UPDATE LOCATION REQUEST:', {
      barbershopId,
      ownerId,
      latitude,
      longitude,
      latitudeType: typeof latitude,
      longitudeType: typeof longitude
    });

    // Validasi parameter wajib
    if (latitude === undefined || longitude === undefined) {
      await t.rollback();
      return res.status(400).json({ 
        message: 'Parameter latitude dan longitude wajib disertakan.' 
      });
    }

    // Cari barbershop
    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
      transaction: t,
    });

    if (!barbershop) {
      await t.rollback();
      return res.status(404).json({
        message: "Barbershop tidak ditemukan atau Anda tidak punya hak akses.",
      });
    }

    console.log('🏪 BARBERSHOP SEBELUM UPDATE:', {
      id: barbershop.barbershop_id,
      name: barbershop.name,
      oldLatitude: barbershop.latitude,
      oldLongitude: barbershop.longitude
    });

    // Validasi dan konversi latitude
    const lat = parseFloat(latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      await t.rollback();
      return res.status(400).json({ 
        message: `Latitude tidak valid: ${latitude}. Harus antara -90 dan 90.` 
      });
    }

    // Validasi dan konversi longitude
    const lon = parseFloat(longitude);
    if (isNaN(lon) || lon < -180 || lon > 180) {
      await t.rollback();
      return res.status(400).json({ 
        message: `Longitude tidak valid: ${longitude}. Harus antara -180 dan 180.` 
      });
    }

    // ✅ UPDATE LOKASI (JANGAN ubah approval_status)
    await barbershop.update({
      latitude: lat,
      longitude: lon
    }, { 
      transaction: t,
      // Force update even if values are the same
      silent: false
    });

    // Commit transaction
    await t.commit();

    // Fetch ulang data terbaru untuk memastikan
    const updatedBarbershop = await Barbershop.findByPk(barbershopId);

    console.log('✅ BARBERSHOP SETELAH UPDATE:', {
      id: updatedBarbershop.barbershop_id,
      name: updatedBarbershop.name,
      newLatitude: updatedBarbershop.latitude,
      newLongitude: updatedBarbershop.longitude
    });

    res.status(200).json({ 
      message: "Lokasi barbershop berhasil diperbarui.", 
      barbershop: updatedBarbershop,
      updated: {
        latitude: updatedBarbershop.latitude,
        longitude: updatedBarbershop.longitude
      }
    });

  } catch (error) {
    await t.rollback();
    console.error("❌ UPDATE BARBERSHOP LOCATION ERROR:", error);
    res.status(500).json({ 
      message: "Terjadi kesalahan pada server", 
      error: error.message 
    });
  }
};

// ===== FUNGSI LAPORAN TRANSAKSI =====
exports.getTransactionReport = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;
    const { type, startDate, endDate } = req.query; // type: 'weekly' atau 'monthly'

    // Verifikasi kepemilikan
    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    // Tentukan rentang tanggal
    let start, end;
    if (startDate && endDate) {
      start = new Date(startDate);
      end = new Date(endDate);
    } else if (type === "weekly") {
      end = new Date();
      start = new Date();
      start.setDate(end.getDate() - 7);
    } else if (type === "monthly") {
      end = new Date();
      start = new Date();
      start.setMonth(end.getMonth() - 1);
    } else {
      // Default: minggu ini
      end = new Date();
      start = new Date();
      start.setDate(end.getDate() - 7);
    }

    // Query bookings dengan join ke Service dan User
    const bookings = await Booking.findAll({
      where: {
        barbershop_id: barbershopId,
        status: "completed",
        payment_status: "paid",
        updatedAt: {
          [Op.between]: [start, end],
        },
      },
      include: [
        {
          model: Service,
          attributes: ["name", "price", "duration_minutes"],
        },
        {
          model: User,
          as: "customer",
          attributes: ["name", "email"],
        },
        {
          model: Staff,
          attributes: ["name"],
        },
      ],
      order: [["updatedAt", "DESC"]],
    });

    // Hitung statistik
    const totalRevenue = bookings.reduce(
      (sum, booking) => sum + parseFloat(booking.total_price),
      0
    );

    const totalTransactions = bookings.length;

    const averageTransaction =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    // Grouping by date
    const dailyStats = {};
    bookings.forEach((booking) => {
      const date = new Date(booking.updatedAt).toLocaleDateString("id-ID");
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          count: 0,
          revenue: 0,
        };
      }
      dailyStats[date].count += 1;
      dailyStats[date].revenue += parseFloat(booking.total_price);
    });

    // Grouping by service
    const serviceStats = {};
    bookings.forEach((booking) => {
      const serviceName = booking.Service?.name || "Unknown";
      if (!serviceStats[serviceName]) {
        serviceStats[serviceName] = {
          name: serviceName,
          count: 0,
          revenue: 0,
        };
      }
      serviceStats[serviceName].count += 1;
      serviceStats[serviceName].revenue += parseFloat(booking.total_price);
    });

    res.status(200).json({
      barbershop: {
        id: barbershop.barbershop_id,
        name: barbershop.name,
      },
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
        type: type || "custom",
      },
      summary: {
        totalRevenue,
        totalTransactions,
        averageTransaction: parseFloat(averageTransaction.toFixed(2)),
      },
      dailyStats: Object.values(dailyStats),
      serviceStats: Object.values(serviceStats),
      transactions: bookings.map((booking) => ({
        booking_id: booking.booking_id,
        date: booking.updatedAt,
        customer_name: booking.customer?.name,
        service_name: booking.Service?.name,
        staff_name: booking.Staff?.name,
        price: parseFloat(booking.total_price),
        payment_status: booking.payment_status,
        paid_at: booking.paid_at,
      })),
    });
  } catch (error) {
    console.error("GET TRANSACTION REPORT ERROR:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.updateBarbershopDescription = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;
    const { description } = req.body;

    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
      transaction: t,
    });

    if (!barbershop) {
      await t.rollback();
      return res.status(404).json({
        message: "Barbershop tidak ditemukan atau Anda tidak punya hak akses.",
      });
    }

    // Validasi minimal karakter (opsional)
    if (description && description.trim().length > 0 && description.trim().length < 10) {
      await t.rollback();
      return res.status(400).json({ message: "Deskripsi minimal 10 karakter." });
    }

    // ✅ PENTING: Hanya update deskripsi, JANGAN ubah approval_status
    await barbershop.update(
      { description: description || null },
      { transaction: t }
    );

    await t.commit();
    res.status(200).json({
      message: "Deskripsi barbershop berhasil diperbarui.",
      barbershop,
    });
  } catch (error) {
    await t.rollback();
    console.error("UPDATE DESCRIPTION ERROR:", error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server",
      error: error.message,
    });
  }
};

exports.getWeeklyChartData = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { barbershopId } = req.params;

    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      return res.status(403).json({ message: "Akses ditolak." });
    }

    // Ambil data 7 hari terakhir
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 6); // 7 hari termasuk hari ini

    // Query booking completed dengan group by date
    const bookings = await Booking.findAll({
      where: {
        barbershop_id: barbershopId,
        status: 'completed',
        payment_status: 'paid',
        updatedAt: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('updatedAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('total_price')), 'revenue'],
        [sequelize.fn('COUNT', sequelize.col('booking_id')), 'count']
      ],
      group: [sequelize.fn('DATE', sequelize.col('updatedAt'))],
      raw: true
    });

    // Buat array untuk 7 hari terakhir
    const chartData = [];
    const dayNames = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = dayNames[date.getDay()];

      // Cari data booking untuk tanggal ini
      const dayData = bookings.find(b => b.date === dateStr);

      chartData.push({
        name: dayName,
        date: dateStr,
        Pendapatan: dayData ? parseInt(dayData.revenue) : 0,
        Transaksi: dayData ? parseInt(dayData.count) : 0
      });
    }

    res.status(200).json(chartData);
  } catch (error) {
    console.error("GET WEEKLY CHART DATA ERROR:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

