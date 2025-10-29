// src/controllers/staff.controller.js - FIXED VERSION
const Barbershop = require('../models/Barbershop.model');
const Staff = require('../models/Staff.model');
const Booking = require('../models/Booking.model');
const User = require('../models/User.model');
const Service = require('../models/Service.model');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Helper function untuk verifikasi kepemilikan
const verifyOwnerAndGetBarbershop = async (ownerId, barbershopId) => {
    if (!barbershopId) {
        throw new Error('Barbershop ID tidak disediakan.');
    }
    const barbershop = await Barbershop.findOne({
        where: { barbershop_id: barbershopId, owner_id: ownerId }
    });

    if (!barbershop) {
        throw new Error('Barbershop tidak ditemukan atau Anda tidak punya hak akses.');
    }
    if (barbershop.approval_status !== 'approved') {
        throw new Error('Aksi tidak diizinkan. Barbershop Anda belum disetujui oleh Admin.');
    }
    return barbershop;
};

// ✅ Helper function untuk cek booking yang terpengaruh oleh perubahan staff
const checkAffectedBookingsByStaff = async (staffId) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    const upcomingBookings = await Booking.findAll({
        where: {
            staff_id: staffId,
            status: {
                [Op.in]: ['confirmed', 'pending_payment']
            },
            booking_time: {
                [Op.between]: [now, thirtyDaysFromNow]
            }
        },
        include: [
            {
                model: User,
                as: 'customer',
                attributes: ['name', 'email', 'phone_number']
            },
            {
                model: Service,
                attributes: ['name', 'duration_minutes']
            }
        ],
        order: [['booking_time', 'ASC']]
    });

    const conflictDetails = upcomingBookings.map(booking => {
        const bookingDate = new Date(booking.booking_time);
        return {
            booking_id: booking.booking_id,
            customer_name: booking.customer?.name,
            customer_phone: booking.customer?.phone_number,
            customer_email: booking.customer?.email,
            service_name: booking.Service?.name,
            booking_date: bookingDate.toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            booking_time: bookingDate.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit'
            }),
            status: booking.status,
            payment_status: booking.payment_status
        };
    });

    return {
        hasConflicts: upcomingBookings.length > 0,
        count: upcomingBookings.length,
        bookings: upcomingBookings,
        details: conflictDetails
    };
};

// ✅ Membuat staf baru dengan upload foto
exports.createStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const { name, specialty } = req.body;
        if (!name) return res.status(400).json({ message: 'Nama staf wajib diisi.' });

        let pictureUrl = null;
        if (req.file) {
            pictureUrl = `/uploads/staff-photos/${req.file.filename}`;
        }

        const newStaff = await Staff.create({
            barbershop_id: barbershopId,
            name,
            picture: pictureUrl,
            specialty,
            is_active: true,
        });

        res.status(201).json({ message: 'Staf baru berhasil ditambahkan.', staff: newStaff });
    } catch (error) {
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(403).json({ message: error.message });
    }
};

// ✅ Mendapatkan semua staf dari barbershop tertentu
exports.getStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staffList = await Staff.findAll({ 
            where: { barbershop_id: barbershopId },
            order: [['createdAt', 'DESC']]
        });
        res.status(200).json(staffList);
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

// ✅ Mengupdate data staf dengan upload foto baru
exports.updateStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({ 
            where: { staff_id: staffId, barbershop_id: barbershopId } 
        });
        
        if (!staff) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ message: 'Staf tidak ditemukan atau Anda tidak punya hak akses.' });
        }

        const updateData = {};
        if (req.body.name) updateData.name = req.body.name;
        if (req.body.specialty !== undefined) updateData.specialty = req.body.specialty;

        if (req.file) {
            if (staff.picture) {
                const oldPhotoPath = path.join(__dirname, '../../public', staff.picture);
                if (fs.existsSync(oldPhotoPath)) {
                    fs.unlinkSync(oldPhotoPath);
                }
            }
            updateData.picture = `/uploads/staff-photos/${req.file.filename}`;
        }
        
        await staff.update(updateData);
        res.status(200).json({ message: 'Data staf berhasil diperbarui.', staff });
    } catch (error) {
        if (req.file) fs.unlinkSync(req.file.path);
        res.status(403).json({ message: error.message });
    }
};

// ✅ FIXED: Menonaktifkan staf dengan cek konflik booking
exports.deactivateStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        const { force_update } = req.body;

        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({ 
            where: { staff_id: staffId, barbershop_id: barbershopId } 
        });
        
        if (!staff) {
            return res.status(404).json({ message: 'Staf tidak ditemukan atau Anda tidak punya hak akses.' });
        }

        if (!staff.is_active) {
            return res.status(400).json({ message: 'Staf sudah dalam status nonaktif.' });
        }

        // ✅ CEK KONFLIK BOOKING
        const conflictCheck = await checkAffectedBookingsByStaff(staffId);

        if (conflictCheck.hasConflicts && !force_update) {
            return res.status(409).json({
                message: `Staff ${staff.name} memiliki booking yang akan datang`,
                require_confirmation: true,
                affected_bookings: {
                    count: conflictCheck.count,
                    details: conflictCheck.details,
                    warning: 'Booking-booking ini perlu dipindahkan ke staff lain atau dibatalkan.'
                }
            });
        }

        await staff.update({ is_active: false });
        
        res.status(200).json({ 
            message: 'Staf berhasil dinonaktifkan.', 
            staff,
            affected_bookings: conflictCheck.hasConflicts ? {
                count: conflictCheck.count,
                message: 'Segera reassign booking ke staff lain atau hubungi customer.'
            } : null
        });
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

// ✅ Mengaktifkan kembali staf
exports.activateStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({ 
            where: { staff_id: staffId, barbershop_id: barbershopId } 
        });
        
        if (!staff) {
            return res.status(404).json({ message: 'Staf tidak ditemukan atau Anda tidak punya hak akses.' });
        }

        await staff.update({ is_active: true });
        res.status(200).json({ message: 'Staf berhasil diaktifkan kembali.', staff });
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

// ✅ Menghapus staf permanen (dengan cek konflik)
exports.deleteStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({ 
            where: { staff_id: staffId, barbershop_id: barbershopId } 
        });
        
        if (!staff) {
            return res.status(404).json({ message: 'Staf tidak ditemukan atau Anda tidak punya hak akses.' });
        }

        // ✅ CEK APAKAH ADA BOOKING (TERMASUK HISTORY)
        const allBookings = await Booking.count({
            where: { staff_id: staffId }
        });

        if (allBookings > 0) {
            return res.status(400).json({ 
                message: 'Tidak dapat menghapus staf yang memiliki riwayat booking. Gunakan fitur nonaktifkan sebagai gantinya.',
                bookings_count: allBookings
            });
        }

        // Hapus foto jika ada
        if (staff.picture) {
            const photoPath = path.join(__dirname, '../../public', staff.picture);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }

        await staff.destroy();
        res.status(200).json({ message: 'Staf berhasil dihapus permanen.' });
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

// ✅ NEW: Reassign booking dari staff yang dinonaktifkan ke staff lain
exports.reassignBookings = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        const { new_staff_id } = req.body;

        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        if (!new_staff_id) {
            return res.status(400).json({ message: 'ID staff baru wajib disertakan.' });
        }

        // Cek staff baru ada dan aktif
        const newStaff = await Staff.findOne({
            where: { 
                staff_id: new_staff_id, 
                barbershop_id: barbershopId,
                is_active: true
            }
        });

        if (!newStaff) {
            return res.status(404).json({ message: 'Staff baru tidak ditemukan atau tidak aktif.' });
        }

        // Ambil booking yang akan datang
        const now = new Date();
        const affectedBookings = await Booking.findAll({
            where: {
                staff_id: staffId,
                status: {
                    [Op.in]: ['confirmed', 'pending_payment']
                },
                booking_time: {
                    [Op.gte]: now
                }
            }
        });

        // ✅ CEK KONFLIK JADWAL DENGAN STAFF BARU
        const conflicts = [];
        for (const booking of affectedBookings) {
            const conflictingBooking = await Booking.findOne({
                where: {
                    staff_id: new_staff_id,
                    status: { [Op.ne]: 'cancelled' },
                    booking_time: { [Op.lt]: booking.end_time },
                    end_time: { [Op.gt]: booking.booking_time }
                }
            });

            if (conflictingBooking) {
                conflicts.push({
                    booking_id: booking.booking_id,
                    booking_time: booking.booking_time,
                    reason: 'Staff baru sudah memiliki booking pada waktu yang sama'
                });
            }
        }

        if (conflicts.length > 0) {
            return res.status(409).json({
                message: 'Beberapa booking tidak dapat dipindahkan karena konflik jadwal',
                conflicts,
                successful_count: affectedBookings.length - conflicts.length,
                failed_count: conflicts.length
            });
        }

        // Update semua booking
        await Booking.update(
            { staff_id: new_staff_id },
            {
                where: {
                    staff_id: staffId,
                    status: {
                        [Op.in]: ['confirmed', 'pending_payment']
                    },
                    booking_time: {
                        [Op.gte]: now
                    }
                }
            }
        );

        res.status(200).json({
            message: `Berhasil memindahkan ${affectedBookings.length} booking ke ${newStaff.name}`,
            reassigned_count: affectedBookings.length
        });
    } catch (error) {
        console.error('Reassign bookings error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.reassignBookings = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        const { new_staff_id } = req.body;

        console.log('🔄 REASSIGN REQUEST:', { barbershopId, staffId, new_staff_id });

        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        if (!new_staff_id) {
            return res.status(400).json({ message: 'ID staff baru wajib disertakan.' });
        }

        // ✅ Validasi staff lama exists
        const oldStaff = await Staff.findOne({
            where: { 
                staff_id: staffId, 
                barbershop_id: barbershopId
            }
        });

        if (!oldStaff) {
            return res.status(404).json({ message: 'Staff tidak ditemukan.' });
        }

        // ✅ Cek staff baru ada dan aktif
        const newStaff = await Staff.findOne({
            where: { 
                staff_id: new_staff_id, 
                barbershop_id: barbershopId,
                is_active: true
            }
        });

        if (!newStaff) {
            return res.status(404).json({ message: 'Staff baru tidak ditemukan atau tidak aktif.' });
        }

        // ✅ Ambil booking yang akan datang dari staff lama
        const now = new Date();
        const affectedBookings = await Booking.findAll({
            where: {
                staff_id: staffId,
                status: {
                    [Op.in]: ['confirmed', 'pending_payment']
                },
                booking_time: {
                    [Op.gte]: now
                }
            },
            order: [['booking_time', 'ASC']]
        });

        console.log(`📋 Found ${affectedBookings.length} bookings to reassign`);

        if (affectedBookings.length === 0) {
            return res.status(200).json({
                message: 'Tidak ada booking yang perlu dipindahkan',
                reassigned_count: 0
            });
        }

        // ✅ CEK KONFLIK JADWAL DENGAN STAFF BARU
        const conflicts = [];
        for (const booking of affectedBookings) {
            const conflictingBooking = await Booking.findOne({
                where: {
                    staff_id: new_staff_id,
                    status: { [Op.ne]: 'cancelled' },
                    booking_time: { [Op.lt]: booking.end_time },
                    end_time: { [Op.gt]: booking.booking_time }
                }
            });

            if (conflictingBooking) {
                conflicts.push({
                    booking_id: booking.booking_id,
                    booking_time: booking.booking_time.toLocaleString('id-ID'),
                    reason: 'Staff baru sudah memiliki booking pada waktu yang sama'
                });
            }
        }

        if (conflicts.length > 0) {
            console.log('⚠️ CONFLICTS DETECTED:', conflicts);
            return res.status(409).json({
                message: 'Beberapa booking tidak dapat dipindahkan karena konflik jadwal',
                conflicts,
                successful_count: 0,
                failed_count: conflicts.length
            });
        }

        // ✅ Update semua booking
        const [updatedCount] = await Booking.update(
            { staff_id: new_staff_id },
            {
                where: {
                    staff_id: staffId,
                    status: {
                        [Op.in]: ['confirmed', 'pending_payment']
                    },
                    booking_time: {
                        [Op.gte]: now
                    }
                }
            }
        );

        console.log(`✅ Successfully reassigned ${updatedCount} bookings`);

        res.status(200).json({
            message: `Berhasil memindahkan ${updatedCount} booking dari ${oldStaff.name} ke ${newStaff.name}`,
            reassigned_count: updatedCount,
            old_staff: oldStaff.name,
            new_staff: newStaff.name
        });
    } catch (error) {
        console.error('❌ Reassign bookings error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};