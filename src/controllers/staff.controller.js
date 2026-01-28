// src/controllers/staff.controller.js - PERBAIKAN LENGKAP
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
    
    return barbershop;
};

// Helper function untuk cek booking yang terpengaruh oleh perubahan staff
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
    console.log('\n=== CREATE STAFF DEBUG ===');
    console.log('1. User:', req.user ? `${req.user.id} (${req.user.role})` : 'NOT AUTHENTICATED');
    console.log('2. Params:', req.params);
    console.log('3. Body:', req.body);
    console.log('4. File:', req.file ? `${req.file.filename} (${req.file.size} bytes)` : 'No file');
    console.log('5. Content-Type:', req.headers['content-type']);
    
    try {
        // Validasi user
        if (!req.user || !req.user.id) {
            console.log('❌ ERROR: User tidak terautentikasi');
            return res.status(401).json({ message: 'User tidak terautentikasi' });
        }

        const ownerId = req.user.id;
        const { barbershopId } = req.params;
        
        // Validasi barbershopId
        if (!barbershopId) {
            console.log('❌ ERROR: Barbershop ID tidak ada di params');
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Barbershop ID tidak ditemukan' });
        }

        console.log('6. Verifying barbershop ownership...');
        const barbershop = await verifyOwnerAndGetBarbershop(ownerId, barbershopId);
        console.log('✅ Barbershop verified:', barbershop.name);

        const { name, specialty } = req.body;
        
        // Validasi input
        if (!name || name.trim() === '') {
            console.log('❌ ERROR: Nama staff kosong');
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({ message: 'Nama staf wajib diisi.' });
        }

        let pictureUrl = null;
        if (req.file) {
            pictureUrl = `/uploads/staff-photos/${req.file.filename}`;
            console.log('📸 Photo URL:', pictureUrl);
        }

        const staffData = {
            barbershop_id: barbershopId,
            name: name.trim(),
            picture: pictureUrl,
            specialty: specialty ? specialty.trim() : null,
            is_active: true,
        };

        console.log('7. Creating staff with data:', staffData);
        const newStaff = await Staff.create(staffData);
        console.log('✅ Staff created successfully:', newStaff.staff_id);

        res.status(201).json({ 
            message: 'Staf baru berhasil ditambahkan.', 
            staff: newStaff 
        });

    } catch (error) {
        console.error('\n❌ === CREATE STAFF ERROR ===');
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('=========================\n');
        
        // Hapus file jika ada error
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
                console.log('🗑️ File deleted after error');
            } catch (unlinkError) {
                console.error('⚠️ Could not delete file:', unlinkError.message);
            }
        }

        // Send error response
        const statusCode = error.message.includes('tidak ditemukan') ? 404 : 
                          error.message.includes('tidak punya hak akses') ? 403 : 500;
        
        res.status(statusCode).json({ 
            message: error.message || 'Internal server error',
            error: process.env.NODE_ENV === 'development' ? {
                name: error.name,
                stack: error.stack
            } : undefined
        });
    }
};

// Mendapatkan semua staf dari barbershop tertentu
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
        console.error('Get Staff Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Mengupdate data staf dengan upload foto baru
exports.updateStaff = async (req, res) => {
    console.log('\n=== UPDATE STAFF DEBUG ===');
    console.log('User:', req.user?.id);
    console.log('Params:', req.params);
    console.log('Body:', req.body);
    console.log('File:', req.file ? req.file.filename : 'No file');
    
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;

        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({ 
            where: { staff_id: staffId, barbershop_id: barbershopId } 
        });
        
        if (!staff) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(404).json({ message: 'Staf tidak ditemukan.' });
        }

        const { name, specialty } = req.body;
        
        // Update fields
        if (name && name.trim() !== '') {
            staff.name = name.trim();
        }
        
        if (specialty !== undefined) {
            staff.specialty = specialty ? specialty.trim() : null;
        }

        // Update foto jika ada file baru
        if (req.file) {
            // Hapus foto lama jika ada
            if (staff.picture) {
                const oldPath = path.join(__dirname, '../../public', staff.picture);
                if (fs.existsSync(oldPath)) {
                    try {
                        fs.unlinkSync(oldPath);
                    } catch (err) {
                        console.warn('Could not delete old photo:', err);
                    }
                }
            }
            staff.picture = `/uploads/staff-photos/${req.file.filename}`;
            console.log('📸 Photo updated:', staff.picture);
        }

        await staff.save();
        console.log('✅ Staff updated successfully');

        res.status(200).json({ 
            message: 'Data staf berhasil diperbarui.', 
            staff 
        });

    } catch (error) {
        console.error('❌ Update Staff Error:', error);
        
        if (req.file) {
            try {
                fs.unlinkSync(req.file.path);
            } catch (unlinkError) {
                console.error('Error deleting file:', unlinkError);
            }
        }

        res.status(500).json({ 
            message: error.message || 'Terjadi kesalahan saat memperbarui staff.'
        });
    }
};

// Deactivate staff dengan cek konflik booking
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
            return res.status(404).json({ message: 'Staff tidak ditemukan.' });
        }

        if (!staff.is_active) {
            return res.status(400).json({ message: 'Staff sudah nonaktif.' });
        }

        const affectedBookings = await checkAffectedBookingsByStaff(staffId);

        if (affectedBookings.hasConflicts && !force_update) {
            return res.status(409).json({
                message: 'Staff memiliki booking yang akan datang.',
                affected_bookings: {
                    count: affectedBookings.count,
                    details: affectedBookings.details,
                    warning: 'Menonaktifkan staff akan mempengaruhi booking customer.'
                }
            });
        }

        staff.is_active = false;
        await staff.save();

        res.status(200).json({
            message: 'Staff berhasil dinonaktifkan.',
            staff,
            warning: affectedBookings.hasConflicts ? 
                'Pastikan untuk menghubungi customer terkait perubahan ini.' : null
        });

    } catch (error) {
        console.error('Deactivate Staff Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Activate staff kembali
exports.activateStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;

        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({
            where: { staff_id: staffId, barbershop_id: barbershopId }
        });

        if (!staff) {
            return res.status(404).json({ message: 'Staff tidak ditemukan.' });
        }

        if (staff.is_active) {
            return res.status(400).json({ message: 'Staff sudah aktif.' });
        }

        staff.is_active = true;
        await staff.save();

        res.status(200).json({
            message: 'Staff berhasil diaktifkan kembali.',
            staff
        });

    } catch (error) {
        console.error('Activate Staff Error:', error);
        res.status(500).json({ message: error.message });
    }
};

// Reassign bookings dari satu staff ke staff lain
exports.reassignBookings = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        const { new_staff_id } = req.body;

        console.log('🔄 Reassign Request:', {
            barbershopId,
            oldStaffId: staffId,
            newStaffId: new_staff_id
        });

        if (!new_staff_id) {
            return res.status(400).json({ message: 'Staff pengganti harus dipilih.' });
        }

        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const oldStaff = await Staff.findOne({
            where: { staff_id: staffId, barbershop_id: barbershopId }
        });

        if (!oldStaff) {
            return res.status(404).json({ message: 'Staff lama tidak ditemukan.' });
        }

        const newStaff = await Staff.findOne({
            where: { staff_id: new_staff_id, barbershop_id: barbershopId, is_active: true }
        });

        if (!newStaff) {
            return res.status(404).json({ message: 'Staff pengganti tidak ditemukan atau tidak aktif.' });
        }

        const affectedBookings = await checkAffectedBookingsByStaff(staffId);

        if (!affectedBookings.hasConflicts) {
            return res.status(200).json({ 
                message: 'Tidak ada booking yang perlu di-reassign.',
                reassigned_count: 0
            });
        }

        const newStaffBookingTimes = await Booking.findAll({
            where: {
                staff_id: new_staff_id,
                status: { [Op.in]: ['confirmed', 'pending_payment'] },
                booking_time: {
                    [Op.in]: affectedBookings.bookings.map(b => b.booking_time)
                }
            }
        });

        if (newStaffBookingTimes.length > 0) {
            return res.status(409).json({
                message: 'Staff pengganti memiliki konflik jadwal.',
                conflicts: newStaffBookingTimes.length
            });
        }

        const updateResult = await Booking.update(
            { staff_id: new_staff_id },
            {
                where: {
                    staff_id: staffId,
                    status: { [Op.in]: ['confirmed', 'pending_payment'] },
                    booking_time: { [Op.gte]: new Date() }
                }
            }
        );

        console.log('✅ Bookings reassigned:', updateResult[0]);

        res.status(200).json({
            message: `${updateResult[0]} booking berhasil dipindahkan ke ${newStaff.name}.`,
            reassigned_count: updateResult[0],
            from_staff: oldStaff.name,
            to_staff: newStaff.name
        });

    } catch (error) {
        console.error('❌ Reassign Bookings Error:', error);
        res.status(500).json({ 
            message: error.message || 'Terjadi kesalahan saat reassign booking.'
        });
    }
};

// Hapus staff permanen
exports.deleteStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;

        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({
            where: { staff_id: staffId, barbershop_id: barbershopId }
        });

        if (!staff) {
            return res.status(404).json({ message: 'Staff tidak ditemukan.' });
        }

        const hasActiveBookings = await Booking.count({
            where: {
                staff_id: staffId,
                status: { [Op.in]: ['confirmed', 'pending_payment'] },
                booking_time: { [Op.gte]: new Date() }
            }
        });

        if (hasActiveBookings > 0) {
            return res.status(400).json({
                message: 'Tidak dapat menghapus staff yang masih memiliki booking aktif.'
            });
        }

        if (staff.picture) {
            const photoPath = path.join(__dirname, '../../public', staff.picture);
            if (fs.existsSync(photoPath)) {
                try {
                    fs.unlinkSync(photoPath);
                } catch (err) {
                    console.warn('Could not delete photo:', err);
                }
            }
        }

        await staff.destroy();

        res.status(200).json({ message: 'Staff berhasil dihapus.' });

    } catch (error) {
        console.error('Delete Staff Error:', error);
        res.status(500).json({ message: error.message });
    }
};