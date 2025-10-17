const Barbershop = require("../models/Barbershop.model");
const User = require("../models/User.model");
const bcrypt = require("bcryptjs");
const sequelize = require("../config/database");

// Mendapatkan semua barbershop
// exports.getAllBarbershops = async (req, res) => {
//     try {
//         const { status } = req.query;

//         let whereClause = {};
//         if (status && ['pending', 'approved', 'rejected'].includes(status)) {
//             whereClause.approval_status = status;
//         }

//         const allShops = await Barbershop.findAll({
//             where: whereClause,
//             include: {
//                 model: User,
//                 as: 'owner',
//                 attributes: ['name', 'email']
//             },
//             order: [['createdAt', 'DESC']]
//         });

//         const formattedShops = allShops.map(shop => {
//             const shopData = shop.get({ plain: true });
//             if (shopData.opening_hours && typeof shopData.opening_hours === 'string') {
//                 shopData.opening_hours = JSON.parse(shopData.opening_hours);
//             }
//             return shopData;
//         });

//         res.status(200).json(formattedShops);
//     } catch (error) {
//         res.status(500).json({ message: 'Server Error', error: error.message });
//     }
// };

exports.getAllBarbershops = async (req, res) => {
  try {
    const { status } = req.query;
    let whereClause = {};
    if (status && ["pending", "approved", "rejected"].includes(status)) {
      whereClause.approval_status = status;
    }

    const allShops = await Barbershop.findAll({
      where: whereClause,
      include: {
        model: User,
        as: "owner",
        attributes: ["name", "email"],
      },
      order: [["createdAt", "DESC"]],
    });
    // Langsung kirim array 'allShops' tanpa mapping dan parsing manual
    res.status(200).json(allShops);
  } catch (error) {
    console.error("GET ALL BARBERSHOPS ERROR:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Menyetujui sebuah barbershop
exports.approveBarbershop = async (req, res) => {
  // Gunakan transaksi untuk memastikan kedua operasi (update barbershop & user) berhasil atau gagal bersamaan
  const t = await sequelize.transaction();

  try {
    const { id } = req.params;
    const adminId = req.user.id;

    // 1. Cari barbershop terlebih dahulu untuk mendapatkan owner_id
    const barbershop = await Barbershop.findByPk(id, { transaction: t });
    if (!barbershop) {
      await t.rollback();
      return res.status(404).json({ message: "Barbershop tidak ditemukan." });
    }

    // 2. Update status barbershop
    await barbershop.update(
      {
        approval_status: "approved",
        verified_by: adminId,
      },
      { transaction: t }
    );

    // 3. ✅ UPDATED: Set is_owner = TRUE (tetap is_customer = TRUE!)
    await User.update(
      {
        is_owner: true, // ✅ User sekarang jadi owner
        role: "customer_owner", // ✅ Update role untuk identifikasi hybrid
        // is_customer TETAP TRUE!
      },
      { where: { user_id: barbershop.owner_id }, transaction: t }
    );

    // 4. Jika semua berhasil, simpan perubahan secara permanen
    await t.commit();

    res
      .status(200)
      .json({
        message:
          "Barbershop berhasil disetujui. User sekarang memiliki akses owner dan tetap bisa menggunakan fitur customer.",
      });
  } catch (error) {
    // 5. Jika ada satu saja error, batalkan semua perubahan yang sudah terjadi
    await t.rollback();

    // Log error di console backend untuk memudahkan debugging di masa depan
    console.error("ERROR SAAT APPROVE BARBERSHOP:", error);

    res
      .status(500)
      .json({
        message: "Terjadi kesalahan pada server saat menyetujui barbershop.",
      });
  }
};

// Menolak sebuah barbershop
exports.rejectBarbershop = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.user.id;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ message: "Alasan penolakan wajib diisi." });
    }

    const [updated] = await Barbershop.update(
      {
        approval_status: "rejected",
        verified_by: adminId,
        rejection_reason: reason,
      },
      { where: { barbershop_id: id } }
    );

    if (updated) {
      res.status(200).json({ message: "Barbershop berhasil ditolak." });
    } else {
      res.status(404).json({ message: "Barbershop tidak ditemukan." });
    }
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// Membuat akun admin baru (hanya bisa dilakukan oleh admin lain)
exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;
    // Validasi sama seperti register biasa
    const hashedPassword = await bcrypt.hash(password, 10);
    const newAdmin = await User.create({
      name: name,
      email: email,
      password: hashedPassword,
      phone_number: phoneNumber,
      role: "admin",
    });

    const userResponse = newAdmin.toJSON();
    delete userResponse.password;
    res
      .status(201)
      .json({ message: "Akun admin baru berhasil dibuat", user: userResponse });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Email atau nomor telepon sudah terdaftar." });
    }
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    // Jalankan beberapa query secara bersamaan untuk efisiensi
    const [
      userCount,
      ownerCount,
      barbershopCount,
      pendingCount,
      approvedCount,
    ] = await Promise.all([
      User.count(),
      User.count({ where: { is_owner: true } }),
      Barbershop.count(),
      Barbershop.count({ where: { approval_status: "pending" } }),
      Barbershop.count({ where: { approval_status: "approved" } }),
    ]);

    res.status(200).json({
      totalUsers: userCount,
      totalOwners: ownerCount,
      totalBarbershops: barbershopCount,
      pendingBarbershops: pendingCount,
      approvedBarbershops: approvedCount,
    });
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await User.findAll({
      where: {
        role: "admin",
      },
      // PENTING: Jangan pernah kirim hash password ke frontend
      attributes: {
        exclude: ["password_hash"],
      },
      order: [["created_at", "DESC"]], // Urutkan dari yang terbaru
    });

    res.status(200).json(admins);
  } catch (error) {
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};

// exports.getBarbershopById = async (req, res) => {
//     try {
//         const { id } = req.params; // Ambil ID dari parameter URL
//         const shop = await Barbershop.findByPk(id, {
//             include: { // Sertakan juga data pemiliknya
//                 model: User,
//                 as: 'owner',
//                 attributes: ['name', 'email', 'phone_number']
//             }
//         });

//         if (!shop) {
//             return res.status(404).json({ message: 'Barbershop tidak ditemukan.' });
//         }

//         const shopData = shop.get({ plain: true });

//         // Jika opening_hours ada dan tipenya adalah string, parse dia
//         if (shopData.opening_hours && typeof shopData.opening_hours === 'string') {
//             shopData.opening_hours = JSON.parse(shopData.opening_hours);
//         }
//         res.status(200).json(shopData);
//     } catch (error) {
//         res.status(500).json({ message: 'Server Error', error: error.message });
//     }
// };

exports.getBarbershopById = async (req, res) => {
  try {
    const { id } = req.params;
    const shop = await Barbershop.findByPk(id, {
      include: {
        model: User,
        as: "owner",
        attributes: ["name", "email", "phone_number"],
      },
    });

    if (!shop) {
      return res.status(404).json({ message: "Barbershop tidak ditemukan." });
    }
    // Langsung kirim objek 'shop' tanpa parsing manual
    res.status(200).json(shop);
  } catch (error) {
    console.error("GET BARBERSHOP BY ID ERROR:", error);
    res.status(500).json({ message: "Server Error", error: error.message });
  }
};
