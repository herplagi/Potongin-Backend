const sequelize = require('../config/database');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const { startOfDay, endOfDay, startOfMonth, endOfMonth } = require('date-fns');


// Impor semua model yang dibutuhkan
const Barbershop = require('../models/Barbershop.model');
const User = require('../models/User.model');
const Service = require('../models/Service.model');
const Staff = require('../models/Staff.model');
const Booking = require('../models/Booking.model');

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
        // Ambil parameter dari query string
        const { latitude, longitude, max_distance } = req.query;

        // Jika koordinat dan jarak maksimum diberikan, tambahkan logika jarak
        if (latitude && longitude) {
            const lat = parseFloat(latitude);
            const lon = parseFloat(longitude);
            // Default 50 km jika tidak disebutkan, pastikan max_distance positif
            const maxDist = max_distance ? Math.max(parseFloat(max_distance), 0) : 50;

            if (isNaN(lat) || isNaN(lon) || isNaN(maxDist) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
                return res.status(400).json({ message: 'Parameter latitude, longitude, atau max_distance tidak valid.' });
            }

            // Query raw untuk menghitung jarak dan memfilter
            // R = 6371 km adalah jari-jari bumi
            const rawQuery = `
                SELECT *,
                       (6371 * acos(
                           cos(radians(:lat)) *
                           cos(radians(CAST(latitude AS DECIMAL(10,8)))) *
                           cos(radians(CAST(longitude AS DECIMAL(11,8))) - radians(:lon)) +
                           sin(radians(:lat)) *
                           sin(radians(CAST(latitude AS DECIMAL(10,8))))
                       )) AS distance_km
                FROM barbershops
                WHERE approval_status = 'approved'
                  AND latitude IS NOT NULL
                  AND longitude IS NOT NULL
                HAVING distance_km <= :maxDist
                ORDER BY distance_km ASC;
            `;

            const rawResults = await sequelize.query(rawQuery, {
                replacements: { lat: lat, lon: lon, maxDist: maxDist },
                type: sequelize.QueryTypes.SELECT,
            });

            // Filter kolom yang tidak diinginkan dan pastikan tipe data sesuai
            const resultsWithDistance = rawResults.map(shop => {
                 const { latitude, longitude, distance_km, ...filteredShop } = shop;
                 // Hapus latitude/longitude dari response jika tidak diperlukan di frontend untuk privasi atau kebersihan data
                 // Jika kamu ingin menampilkannya di frontend, hapus dua baris berikut:
                 delete filteredShop.latitude;
                 delete filteredShop.longitude;
                 // Tambahkan jarak, pastikan tipe datanya benar
                 filteredShop.distance_km = parseFloat(distance_km.toFixed(2)); // Bulatkan ke 2 desimal
                 return filteredShop;
            });

            res.status(200).json(resultsWithDistance);
            return; // Hentikan eksekusi fungsi setelah mengirim response untuk filter jarak
        }

        // Jika tidak ada filter jarak, kembalikan semua barbershop yang disetujui seperti biasa
        const barbershops = await Barbershop.findAll({
            where: { approval_status: 'approved' },
            attributes: ['barbershop_id', 'name', 'address', 'city', 'main_image_url'],
        });

        res.status(200).json(barbershops);

    } catch (error) {
        console.error("GET ALL BARBERSHOPS ERROR:", error);
        res.status(500).json({ message: "Server Error", error: error.message });
    }
};

exports.getBarbershopDetailsById = async (req, res) => {
    try {
        const { id } = req.params;
        const barbershop = await Barbershop.findOne({
            where: { barbershop_id: id, approval_status: 'approved' },
            include: [
                { model: Service, as: 'services', where: { is_active: true }, required: false },
                { model: Staff, as: 'staff', required: false }
            ]
        });
        if (!barbershop) {
            return res.status(404).json({ message: "Barbershop tidak ditemukan atau belum disetujui." });
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
            return res.status(400).json({ message: 'Semua data dan file wajib diisi.' });
        }

        const ktpUrl = `/uploads/documents/${req.files.ktp[0].filename}`;
        const permitUrl = `/uploads/documents/${req.files.permit[0].filename}`;
        const parsedOpeningHours = JSON.parse(opening_hours);

        const newBarbershop = await Barbershop.create({
            owner_id: userId,
            name, address, city,
            opening_hours: parsedOpeningHours,
            ktp_url: ktpUrl, permit_url: permitUrl,
        }, { transaction: t });

        await t.commit();
        res.status(201).json({ message: 'Pendaftaran barbershop berhasil.', barbershop: newBarbershop });
    } catch (error) {
        await t.rollback();
        console.error("REGISTER BARBERSHOP ERROR:", error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server.' });
    }
};

exports.getMyApplicationStatus = async (req, res) => {
    try {
        const applications = await Barbershop.findAll({
            where: { owner_id: req.user.id },
            order: [['createdAt', 'DESC']]
        });
        if (!applications || applications.length === 0) {
            return res.status(404).json({ message: 'Anda belum memiliki pendaftaran barbershop.' });
        }
        res.status(200).json(applications);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

// =================================================================
// --- FUNGSI KHUSUS UNTUK OWNER ---
// =================================================================

exports.getMyBarbershops = async (req, res) => {
    try {
        const barbershops = await Barbershop.findAll({ where: { owner_id: req.user.id } });
        res.status(200).json(barbershops);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.getMyBarbershopById = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId } = req.params;
        const barbershop = await Barbershop.findOne({
            where: {
                barbershop_id: barbershopId,
                owner_id: ownerId
            }
        });
        if (!barbershop) {
            return res.status(404).json({ message: 'Barbershop tidak ditemukan atau Anda tidak punya hak akses.' });
        }
        res.status(200).json(barbershop);
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.updateMyBarbershop = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;
        const { name, address, city, opening_hours } = req.body;

        const barbershop = await Barbershop.findOne({
            where: { barbershop_id: barbershopId, owner_id: ownerId },
            transaction: t
        });

        if (!barbershop) {
            await t.rollback();
            return res.status(404).json({ message: 'Barbershop tidak ditemukan atau Anda tidak punya hak akses.' });
        }
        
        const updateData = { name, address, city };
        if (opening_hours) {
            updateData.opening_hours = JSON.parse(opening_hours);
        }

        if (req.files) {
            if (req.files.ktp) {
                if (barbershop.ktp_url) fs.unlink(path.join(__dirname, '../../public', barbershop.ktp_url), () => {});
                updateData.ktp_url = `/uploads/documents/${req.files.ktp[0].filename}`;
            }
            if (req.files.permit) {
                if (barbershop.permit_url) fs.unlink(path.join(__dirname, '../../public', barbershop.permit_url), () => {});
                updateData.permit_url = `/uploads/documents/${req.files.permit[0].filename}`;
            }
        }
        
        updateData.approval_status = 'pending';
        updateData.rejection_reason = null;
        updateData.verified_by = null;

        await barbershop.update(updateData, { transaction: t });

        await t.commit();
        res.status(200).json({ message: 'Data barbershop berhasil diperbarui dan diajukan ulang.', barbershop });
    } catch (error) {
        await t.rollback();
        console.error("UPDATE BARBERSHOP ERROR:", error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server', error: error.message });
    }
};

exports.getBarbershopKpis = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId } = req.params;

        const barbershop = await Barbershop.findOne({ 
            where: { barbershop_id: barbershopId, owner_id: ownerId } 
        });
        
        if (!barbershop) {
            return res.status(403).json({ message: 'Akses ditolak.' });
        }

        const now = new Date();
        const [
            revenueToday,
            bookingsToday,
            upcomingBookings,
            serviceCount
        ] = await Promise.all([
            Booking.sum('total_price', { 
                where: { 
                    barbershop_id: barbershopId, 
                    status: 'completed', 
                    updatedAt: { 
                        [Op.between]: [startOfDay(now), endOfDay(now)] 
                    } 
                } 
            }),
            Booking.count({ 
                where: { 
                    barbershop_id: barbershopId, 
                    createdAt: { 
                        [Op.between]: [startOfDay(now), endOfDay(now)] 
                    } 
                } 
            }),
            Booking.count({ 
                where: { 
                    barbershop_id: barbershopId, 
                    booking_time: { [Op.gte]: now },
                    status: { [Op.notIn]: ['cancelled', 'completed'] }
                } 
            }),
            Service.count({ 
                where: { 
                    barbershop_id: barbershopId, 
                    is_active: true 
                } 
            }),
        ]);

        res.status(200).json({
            revenueToday: revenueToday || 0,
            bookingsToday: bookingsToday || 0,
            upcomingBookings: upcomingBookings || 0,
            serviceCount: serviceCount || 0,
        });
    } catch (error) {
        console.error("GET KPI ERROR:", error);
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.resubmitBarbershop = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId } = req.params;

        const barbershop = await Barbershop.findOne({ where: { owner_id: ownerId, barbershop_id: barbershopId } });
        if (!barbershop) {
            return res.status(404).json({ message: 'Barbershop tidak ditemukan atau Anda tidak punya hak akses.' });
        }
        if (barbershop.approval_status !== 'rejected') {
            return res.status(400).json({ message: 'Hanya barbershop yang ditolak yang bisa diajukan ulang.' });
        }

        await barbershop.update({
            approval_status: 'pending',
            rejection_reason: null,
            verified_by: null,
        });

        res.status(200).json({ message: 'Barbershop berhasil diajukan ulang.', barbershop });
    } catch (error) {
        res.status(500).json({ message: 'Server Error', error: error.message });
    }
};

exports.uploadMainImage = async (req, res) => {
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;

        const barbershop = await Barbershop.findOne({
            where: { barbershop_id: barbershopId, owner_id: ownerId }
        });

        if (!barbershop) {
            return res.status(404).json({ message: 'Barbershop tidak ditemukan' });
        }

        if (!req.file) {
            return res.status(400).json({ message: 'File gambar tidak ditemukan' });
        }

        // Hapus gambar lama jika ada
        if (barbershop.main_image_url) {
            const oldImagePath = path.join(__dirname, '../../public', barbershop.main_image_url);
            if (fs.existsSync(oldImagePath)) {
                fs.unlinkSync(oldImagePath);
            }
        }

        const imageUrl = `/uploads/barbershop-images/${req.file.filename}`;
        await barbershop.update({ main_image_url: imageUrl });

        res.status(200).json({
            message: 'Gambar berhasil diupload',
            image_url: imageUrl
        });
    } catch (error) {
        console.error('Upload image error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// ✅ Get gallery images (untuk fitur masa depan)
exports.getGalleryImages = async (req, res) => {
    try {
        const { barbershopId } = req.params;
        const barbershop = await Barbershop.findByPk(barbershopId);
        
        if (!barbershop) {
            return res.status(404).json({ message: 'Barbershop tidak ditemukan' });
        }

        // Untuk saat ini hanya return main image
        // Nanti bisa dikembangkan untuk multiple images
        res.status(200).json({
            main_image: barbershop.main_image_url,
            gallery: [] // untuk fitur masa depan
        });
    } catch (error) {
        console.error('Get gallery error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.updateBarbershopLocation = async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;
        const { latitude, longitude } = req.body; // Hanya ambil latitude dan longitude

        const barbershop = await Barbershop.findOne({
            where: { barbershop_id: barbershopId, owner_id: ownerId },
            transaction: t
        });

        if (!barbershop) {
            await t.rollback();
            return res.status(404).json({ message: 'Barbershop tidak ditemukan atau Anda tidak punya hak akses.' });
        }

        // Validasi input latitude dan longitude
        let updateData = {};
        if (latitude !== undefined) {
            const lat = parseFloat(latitude);
            if (isNaN(lat) || lat < -90 || lat > 90) {
                await t.rollback();
                return res.status(400).json({ message: 'Latitude tidak valid.' });
            }
            updateData.latitude = lat;
        }
        if (longitude !== undefined) {
            const lon = parseFloat(longitude);
            if (isNaN(lon) || lon < -180 || lon > 180) {
                await t.rollback();
                return res.status(400).json({ message: 'Longitude tidak valid.' });
            }
            updateData.longitude = lon;
        }

        // JANGAN ubah approval_status, rejection_reason, atau verified_by
        // Kita hanya memperbarui lokasi
        await barbershop.update(updateData, { transaction: t });

        await t.commit();
        res.status(200).json({ message: 'Lokasi barbershop berhasil diperbarui.', barbershop });
    } catch (error) {
        await t.rollback();
        console.error("UPDATE BARBERSHOP LOCATION ERROR:", error);
        res.status(500).json({ message: 'Terjadi kesalahan pada server', error: error.message });
    }
};