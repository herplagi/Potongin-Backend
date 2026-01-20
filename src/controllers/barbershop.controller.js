// Imports - URUTAN PENTING!
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

const checkIfOpen = (openingHours) => {
  try {
    if (!openingHours) return true; // Default buka jika tidak ada jadwal

    const now = new Date();
    const dayNames = [
      "Minggu",
      "Senin",
      "Selasa",
      "Rabu",
      "Kamis",
      "Jumat",
      "Sabtu",
    ];
    const currentDay = dayNames[now.getDay()];

    // Parse opening_hours (format JSON atau string)
    const schedule =
      typeof openingHours === "string"
        ? JSON.parse(openingHours)
        : openingHours;

    const todaySchedule = schedule[currentDay];

    if (!todaySchedule || !todaySchedule.aktif) {
      return false; // Tutup jika hari ini tidak ada jadwal atau tidak aktif
    }

    // Check current time
    const currentTime = now.getHours() * 60 + now.getMinutes(); // dalam menit

    const [openHour, openMin] = todaySchedule.buka.split(":").map(Number);
    const [closeHour, closeMin] = todaySchedule.tutup.split(":").map(Number);

    const openTime = openHour * 60 + openMin;
    const closeTime = closeHour * 60 + closeMin;

    return currentTime >= openTime && currentTime <= closeTime;
  } catch (error) {
    console.error("Error checking if open:", error);
    return true; // Default buka jika error parsing
  }
};

exports.getAllApprovedBarbershops = async (req, res) => {
  try {
    const { latitude, longitude, max_distance, sort, search } = req.query;

    // Jika koordinat dan jarak maksimum diberikan → cari berdasarkan jarak
    if (latitude && longitude) {
      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);
      const maxDist = max_distance ? Math.max(parseFloat(max_distance), 0) : 5;

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
          message:
            "Parameter latitude, longitude, atau max_distance tidak valid.",
        });
      }

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
          COALESCE(r_stats.review_count, 0) AS review_count,
          COALESCE(b_stats.booking_count, 0) AS booking_count,
          COALESCE(s_count.service_count, 0) AS service_count
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
        LEFT JOIN (
          SELECT 
            barbershop_id,
            COUNT(booking_id) AS booking_count
          FROM bookings
          WHERE status IN ('confirmed', 'completed')
            AND booking_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          GROUP BY barbershop_id
        ) b_stats ON b.barbershop_id = b_stats.barbershop_id
        LEFT JOIN (
          SELECT 
            barbershop_id,
            COUNT(service_id) AS service_count
          FROM services
          WHERE is_active = TRUE
          GROUP BY barbershop_id
        ) s_count ON b.barbershop_id = s_count.barbershop_id
        WHERE b.approval_status = 'approved'
          AND b.latitude IS NOT NULL
          AND b.longitude IS NOT NULL
          ${search ? "AND (b.name LIKE :search OR b.city LIKE :search OR b.address LIKE :search)" : ""}
        HAVING distance_km <= :maxDist
        ORDER BY distance_km ASC;
      `;

      const rawResults = await sequelize.query(rawQuery, {
        replacements: {
          lat,
          lon,
          maxDist,
          ...(search && { search: `%${search}%` }),
        },
        type: sequelize.QueryTypes.SELECT,
      });

      const resultsWithDistance = rawResults.map((shop) => {
        const {
          latitude,
          longitude,
          distance_km,
          average_rating,
          review_count,
          booking_count,
          service_count,
          opening_hours,
          ...filteredShop
        } = shop;

        return {
          ...filteredShop,
          distance: parseFloat(parseFloat(distance_km).toFixed(2)),
          average_rating: parseFloat(parseFloat(average_rating).toFixed(1)),
          review_count: parseInt(review_count, 10) || 0,
          booking_count: parseInt(booking_count, 10) || 0,
          service_count: parseInt(service_count, 10) || 0,
          is_open: checkIfOpen(opening_hours), // ✅ ADD THIS
        };
      });

      return res.status(200).json(resultsWithDistance);
    }

    // Query without distance
    let orderClause = "ORDER BY b.createdAt DESC";

    if (sort === "popular") {
      orderClause = "ORDER BY booking_count DESC, average_rating DESC";
    } else if (sort === "rating") {
      orderClause = "ORDER BY average_rating DESC, review_count DESC";
    }

    const rawQueryAll = `
      SELECT 
        b.*,
        COALESCE(r_stats.avg_rating, 0) AS average_rating,
        COALESCE(r_stats.review_count, 0) AS review_count,
        COALESCE(b_stats.booking_count, 0) AS booking_count,
        COALESCE(s_count.service_count, 0) AS service_count
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
      LEFT JOIN (
        SELECT 
          barbershop_id,
          COUNT(booking_id) AS booking_count
        FROM bookings
        WHERE status IN ('confirmed', 'completed')
          AND booking_time >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY barbershop_id
      ) b_stats ON b.barbershop_id = b_stats.barbershop_id
      LEFT JOIN (
        SELECT 
          barbershop_id,
          COUNT(service_id) AS service_count
        FROM services
        WHERE is_active = TRUE
        GROUP BY barbershop_id
      ) s_count ON b.barbershop_id = s_count.barbershop_id
      WHERE b.approval_status = 'approved'
        ${search ? "AND (b.name LIKE :search OR b.city LIKE :search OR b.address LIKE :search)" : ""}
      ${orderClause};
    `;

    const rawResultsAll = await sequelize.query(rawQueryAll, {
      type: sequelize.QueryTypes.SELECT,
      ...(search && { replacements: { search: `%${search}%` } }),
    });

    const resultsAll = rawResultsAll.map((shop) => {
      const {
        latitude,
        longitude,
        average_rating,
        review_count,
        booking_count,
        service_count,
        opening_hours,
        ...filteredShop
      } = shop;

      return {
        ...filteredShop,
        average_rating: parseFloat(parseFloat(average_rating).toFixed(1)),
        review_count: parseInt(review_count, 10) || 0,
        booking_count: parseInt(booking_count, 10) || 0,
        service_count: parseInt(service_count, 10) || 0,
        is_open: checkIfOpen(opening_hours), // ✅ ADD THIS
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
    const BarbershopFacility = require("../models/BarbershopFacility.model");

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
          where: { is_active: true },
          required: false,
        },
        {
          model: BarbershopFacility,
          as: "facilities",
          through: { attributes: [] }, // Hide junction table fields
          where: { is_active: true },
          required: false,
        },
      ],
    });

    if (!barbershop) {
      return res
        .status(404)
        .json({ message: "Barbershop tidak ditemukan atau belum disetujui." });
    }

    // Add is_open status
    const barbershopData = barbershop.toJSON();
    barbershopData.is_open = checkIfOpen(barbershopData.opening_hours);

    res.status(200).json(barbershopData);
  } catch (error) {
    console.error("GET BARBERSHOP DETAILS ERROR:", error);
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
      { transaction: t },
    );

    await t.commit();
    res.status(201).json({
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
      return res.status(404).json({
        message: "Barbershop tidak ditemukan atau Anda tidak punya hak akses.",
      });
    }

    // ✅ Fetch facilities for this barbershop
    const facilities = await sequelize.query(
      `SELECT 
        bf.facility_id,
        bf.name,
        bf.icon
      FROM BarbershopFacility bf
      INNER JOIN BarbershopHasFacility bhf ON bf.facility_id = bhf.facility_id
      WHERE bhf.barbershop_id = ?
      ORDER BY bf.name`,
      {
        replacements: [barbershopId],
        type: sequelize.QueryTypes.SELECT,
      },
    );

    const barbershopData = barbershop.toJSON();
    barbershopData.facilities = facilities;

    res.status(200).json(barbershopData);
  } catch (error) {
    console.error("GET MY BARBERSHOP ERROR:", error);
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
      return res.status(404).json({
        message: "Barbershop tidak ditemukan atau Anda tidak punya hak akses.",
      });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (opening_hours !== undefined) {
      updateData.opening_hours = JSON.parse(opening_hours);
    }
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
    if (description !== undefined) {
      updateData.description = description || null;
    }

    if (req.files) {
      if (req.files.ktp) {
        if (barbershop.ktp_url)
          fs.unlink(
            path.join(__dirname, "../../public", barbershop.ktp_url),
            () => {},
          );
        updateData.ktp_url = `/uploads/documents/${req.files.ktp[0].filename}`;
      }
      if (req.files.permit) {
        if (barbershop.permit_url)
          fs.unlink(
            path.join(__dirname, "../../public", barbershop.permit_url),
            () => {},
          );
        updateData.permit_url = `/uploads/documents/${req.files.permit[0].filename}`;
      }
    }

    updateData.approval_status = "pending";
    updateData.rejection_reason = null;
    updateData.verified_by = null;

    await barbershop.update(updateData, { transaction: t });

    await t.commit();
    res.status(200).json({
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

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(now.getDate() - 6);
    sevenDaysAgo.setHours(0, 0, 0, 0);

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
        [sequelize.fn("DATE", sequelize.col("paid_at")), "date"],
        [sequelize.fn("SUM", sequelize.col("total_price")), "revenue"],
      ],
      group: [sequelize.fn("DATE", sequelize.col("paid_at"))],
      order: [[sequelize.fn("DATE", sequelize.col("paid_at")), "ASC"]],
      raw: true,
    });

    const chartData = [];
    const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

    for (let i = 0; i < 7; i++) {
      const date = new Date(sevenDaysAgo);
      date.setDate(sevenDaysAgo.getDate() + i);
      const dateString = date.toISOString().split("T")[0];
      const dayName = dayNames[date.getDay()];

      const dayRevenue = weeklyRevenue.find((r) => r.date === dateString);

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
      weeklyChart: chartData,
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
      return res.status(404).json({
        message: "Barbershop tidak ditemukan atau Anda tidak punya hak akses.",
      });
    }
    if (barbershop.approval_status !== "rejected") {
      return res.status(400).json({
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

    if (barbershop.main_image_url) {
      const oldImagePath = path.join(
        __dirname,
        "../../public",
        barbershop.main_image_url,
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

exports.getGalleryImages = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const barbershop = await Barbershop.findByPk(barbershopId);

    if (!barbershop) {
      return res.status(404).json({ message: "Barbershop tidak ditemukan" });
    }

    res.status(200).json({
      main_image: barbershop.main_image_url,
      gallery: [],
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

    if (latitude === undefined || longitude === undefined) {
      await t.rollback();
      return res.status(400).json({
        message: "Parameter latitude dan longitude wajib disertakan.",
      });
    }

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

    const lat = parseFloat(latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      await t.rollback();
      return res.status(400).json({
        message: `Latitude tidak valid: ${latitude}. Harus antara -90 dan 90.`,
      });
    }

    const lon = parseFloat(longitude);
    if (isNaN(lon) || lon < -180 || lon > 180) {
      await t.rollback();
      return res.status(400).json({
        message: `Longitude tidak valid: ${longitude}. Harus antara -180 dan 180.`,
      });
    }

    await barbershop.update(
      {
        latitude: lat,
        longitude: lon,
      },
      {
        transaction: t,
        silent: false,
      },
    );

    await t.commit();

    const updatedBarbershop = await Barbershop.findByPk(barbershopId);

    res.status(200).json({
      message: "Lokasi barbershop berhasil diperbarui.",
      barbershop: updatedBarbershop,
      updated: {
        latitude: updatedBarbershop.latitude,
        longitude: updatedBarbershop.longitude,
      },
    });
  } catch (error) {
    await t.rollback();
    console.error("UPDATE BARBERSHOP LOCATION ERROR:", error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server",
      error: error.message,
    });
  }
};

exports.getTransactionReport = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const ownerId = req.user.id;
    const { type, startDate, endDate } = req.query;

    const barbershop = await Barbershop.findOne({
      where: { barbershop_id: barbershopId, owner_id: ownerId },
    });

    if (!barbershop) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

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
      end = new Date();
      start = new Date();
      start.setDate(end.getDate() - 7);
    }

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

    const totalRevenue = bookings.reduce(
      (sum, booking) => sum + parseFloat(booking.total_price),
      0,
    );

    const totalTransactions = bookings.length;

    const averageTransaction =
      totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

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

    if (
      description &&
      description.trim().length > 0 &&
      description.trim().length < 10
    ) {
      await t.rollback();
      return res
        .status(400)
        .json({ message: "Deskripsi minimal 10 karakter." });
    }

    await barbershop.update(
      { description: description || null },
      { transaction: t },
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

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - 6);

    const bookings = await Booking.findAll({
      where: {
        barbershop_id: barbershopId,
        status: "completed",
        payment_status: "paid",
        updatedAt: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        [sequelize.fn("DATE", sequelize.col("updatedAt")), "date"],
        [sequelize.fn("SUM", sequelize.col("total_price")), "revenue"],
        [sequelize.fn("COUNT", sequelize.col("booking_id")), "count"],
      ],
      group: [sequelize.fn("DATE", sequelize.col("updatedAt"))],
      raw: true,
    });

    const chartData = [];
    const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];
      const dayName = dayNames[date.getDay()];

      const dayData = bookings.find((b) => b.date === dateStr);

      chartData.push({
        name: dayName,
        date: dateStr,
        Pendapatan: dayData ? parseInt(dayData.revenue) : 0,
        Transaksi: dayData ? parseInt(dayData.count) : 0,
      });
    }

    res.status(200).json(chartData);
  } catch (error) {
    console.error("GET WEEKLY CHART DATA ERROR:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// =================================================================
// --- FITUR BARU - UNTUK MOBILE APP ---
// =================================================================

exports.getTrendingBarbershops = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const query = `
      SELECT 
        b.*,
        COALESCE(AVG(r.rating), 0) as average_rating,
        COUNT(DISTINCT r.review_id) as review_count,
        COUNT(DISTINCT bk.booking_id) as booking_count,
        COUNT(DISTINCT s.service_id) as service_count
      FROM barbershops b
      LEFT JOIN reviews r ON b.barbershop_id = r.barbershop_id
      LEFT JOIN bookings bk ON b.barbershop_id = bk.barbershop_id 
        AND bk.createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      LEFT JOIN services s ON b.barbershop_id = s.barbershop_id AND s.is_active = TRUE
      WHERE b.approval_status = 'approved'
      GROUP BY b.barbershop_id
      HAVING review_count > 0
      ORDER BY booking_count DESC, average_rating DESC, review_count DESC
      LIMIT ?
    `;

    const trending = await sequelize.query(query, {
      replacements: [parseInt(limit)],
      type: sequelize.QueryTypes.SELECT,
    });

    res.json(trending);
  } catch (error) {
    console.error("Error fetching trending barbershops:", error);
    res
      .status(500)
      .json({ message: "Gagal mengambil data barbershop trending" });
  }
};

exports.getStatistics = async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(DISTINCT b.barbershop_id) as total_barbershops,
        COUNT(DISTINCT u.user_id) as total_users,
        COUNT(DISTINCT bk.booking_id) as total_bookings,
        COALESCE(AVG(r.rating), 0) as average_rating
      FROM barbershops b
      LEFT JOIN users u ON u.role = 'customer'
      LEFT JOIN bookings bk ON bk.status = 'completed'
      LEFT JOIN reviews r ON r.rating IS NOT NULL
      WHERE b.approval_status = 'approved'
    `;

    const stats = await sequelize.query(query, {
      type: sequelize.QueryTypes.SELECT,
    });

    res.json(stats[0]);
  } catch (error) {
    console.error("Error fetching statistics:", error);
    res.status(500).json({ message: "Gagal mengambil statistik" });
  }
};

exports.getBarbershopHours = async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const schedules = await sequelize.query(
      `SELECT 
        day_of_week,
        open_time,
        close_time,
        is_closed
      FROM BarbershopSchedule
      WHERE barbershop_id = ?
      ORDER BY FIELD(day_of_week, 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday')`,
      {
        replacements: [barbershopId],
        type: sequelize.QueryTypes.SELECT,
      },
    );

    res.json({ schedules });
  } catch (error) {
    console.error("Error fetching barbershop hours:", error);
    res.status(500).json({ message: "Error fetching operating hours" });
  }
};

exports.getBarbershopFacilities = async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const facilities = await sequelize.query(
      `SELECT 
        bf.facility_id,
        bf.name,
        bf.icon,
        bf.description
      FROM BarbershopFacility bf
      WHERE bf.barbershop_id = ?
      ORDER BY bf.name`,
      {
        replacements: [barbershopId],
        type: sequelize.QueryTypes.SELECT,
      },
    );

    res.json({ facilities });
  } catch (error) {
    console.error("Error fetching facilities:", error);
    res.status(500).json({ message: "Error fetching facilities" });
  }
};

exports.getBarbershopGallery = async (req, res) => {
  try {
    const { barbershopId } = req.params;

    const images = await sequelize.query(
      `SELECT 
        image_id,
        image_url,
        caption,
        display_order,
        created_at
      FROM BarbershopImage
      WHERE barbershop_id = ?
      ORDER BY display_order ASC, created_at DESC`,
      {
        replacements: [barbershopId],
        type: sequelize.QueryTypes.SELECT,
      },
    );

    res.json({ images });
  } catch (error) {
    console.error("Error fetching gallery:", error);
    res.status(500).json({ message: "Error fetching gallery" });
  }
};

exports.getPopularServices = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const limit = parseInt(req.query.limit) || 5;

    const services = await sequelize.query(
      `SELECT 
        s.*,
        COUNT(b.booking_id) as booking_count
      FROM services s
      LEFT JOIN bookings b ON s.service_id = b.service_id AND b.status = 'completed'
      WHERE s.barbershop_id = ?
      GROUP BY s.service_id
      ORDER BY booking_count DESC, s.name ASC
      LIMIT ?`,
      {
        replacements: [barbershopId, limit],
        type: sequelize.QueryTypes.SELECT,
      },
    );

    res.json({ services });
  } catch (error) {
    console.error("Error fetching popular services:", error);
    res.status(500).json({ message: "Error fetching popular services" });
  }
};

// ✅ FIXED: Get all available facilities (for selection UI)
exports.getAllFacilities = async (req, res) => {
  try {
    const facilities = await sequelize.query(
      `SELECT 
        facility_id,
        name,
        icon,
        is_active
      FROM BarbershopFacility
      WHERE is_active = true
      ORDER BY name ASC`,
      {
        type: sequelize.QueryTypes.SELECT,
      },
    );

    res.json(facilities);
  } catch (error) {
    console.error("Error fetching all facilities:", error);
    res.status(500).json({
      message: "Error fetching facilities list",
      error: error.message,
    });
  }
};

// ✅ FIXED: Update barbershop facilities (owner only)
exports.updateBarbershopFacilities = async (req, res) => {
  try {
    const { barbershopId } = req.params;
    const { facility_ids } = req.body;

    console.log("Updating facilities for barbershop:", barbershopId);
    console.log("Facility IDs:", facility_ids);
    console.log("User ID from token:", req.user.id);

    // Validate owner
    const barbershop = await Barbershop.findOne({
      where: {
        barbershop_id: barbershopId,
        owner_id: req.user.id,
      },
    });

    if (!barbershop) {
      return res.status(404).json({
        message: "Barbershop tidak ditemukan atau Anda tidak memiliki akses",
      });
    }

    // Validate facility_ids
    if (!Array.isArray(facility_ids)) {
      return res.status(400).json({
        message: "facility_ids harus berupa array",
      });
    }

    // Start transaction
    const transaction = await sequelize.transaction();

    try {
      // Delete existing facilities
      await sequelize.query(
        `DELETE FROM BarbershopHasFacility WHERE barbershop_id = ?`,
        {
          replacements: [barbershopId],
          type: sequelize.QueryTypes.DELETE,
          transaction,
        },
      );

      // Insert new facilities (only if array not empty)
      if (facility_ids.length > 0) {
        // Validate each facility_id format (should be UUID)
        const validFacilities = facility_ids.filter(
          (id) => id && typeof id === "string" && id.length > 0,
        );

        if (validFacilities.length > 0) {
          // ✅ FIXED: Remove created_at column - only insert barbershop_id and facility_id
          const values = validFacilities
            .map((facilityId) => `('${barbershopId}', '${facilityId}')`)
            .join(",");

          await sequelize.query(
            `INSERT INTO BarbershopHasFacility (barbershop_id, facility_id) 
             VALUES ${values}`,
            {
              type: sequelize.QueryTypes.INSERT,
              transaction,
            },
          );
        }
      }

      await transaction.commit();

      // Fetch updated facilities
      const updatedFacilities = await sequelize.query(
        `SELECT 
          bf.facility_id,
          bf.name,
          bf.icon
        FROM BarbershopFacility bf
        INNER JOIN BarbershopHasFacility bhf ON bf.facility_id = bhf.facility_id
        WHERE bhf.barbershop_id = ?
        ORDER BY bf.name`,
        {
          replacements: [barbershopId],
          type: sequelize.QueryTypes.SELECT,
        },
      );

      res.json({
        message: "Fasilitas berhasil diperbarui",
        facilities: updatedFacilities,
      });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error("Error updating facilities:", error);
    res.status(500).json({
      message: "Error updating facilities",
      error: error.message,
    });
  }
};

module.exports = exports;
