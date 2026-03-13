const Barbershop = require('../models/Barbershop.model');
const Staff = require('../models/Staff.model');
const Booking = require('../models/Booking.model');
const User = require('../models/User.model');
const Service = require('../models/Service.model');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');
const StaffUnavailability = require('../models/StaffUnavailability');
const sequelize = require('../config/database');

const getAffectedBookingsByRange = async (staffId, startTime, endTime) => {
  const bookings = await Booking.findAll({
    where: {
      staff_id: staffId,
      status: { [Op.in]: ['confirmed', 'pending_payment'] },
      booking_time: { [Op.lt]: endTime },
      end_time: { [Op.gt]: startTime },
    },
    include: [
      { model: User, as: 'customer', attributes: ['name', 'email', 'phone_number'] },
      { model: Service, attributes: ['name', 'duration_minutes'] },
    ],
    order: [['booking_time', 'ASC']],
  });

  return bookings.map((booking) => ({
    booking_id: booking.booking_id,
    customer_name: booking.customer?.name,
    customer_phone: booking.customer?.phone_number,
    customer_email: booking.customer?.email,
    service_name: booking.Service?.name,
    duration_minutes: booking.Service?.duration_minutes || 30,
    booking_time: booking.booking_time,
    end_time: booking.end_time,
    status: booking.status,
  }));
};

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

exports.previewTemporaryDeactivation = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { barbershopId, staffId } = req.params;
    const { start_time, end_time } = req.body;

    if (!start_time || !end_time) {
      return res.status(400).json({ message: 'start_time dan end_time wajib diisi.' });
    }

    const startTime = new Date(start_time);
    const endTime = new Date(end_time);

    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime()) || startTime >= endTime) {
      return res.status(400).json({ message: 'Range waktu tidak valid.' });
    }

    await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

    const staff = await Staff.findOne({
      where: { staff_id: staffId, barbershop_id: barbershopId, is_active: true },
    });

    if (!staff) {
      return res.status(404).json({ message: 'Staff tidak ditemukan atau nonaktif.' });
    }

    const affected = await getAffectedBookingsByRange(staffId, startTime, endTime);

    return res.status(200).json({
      has_conflicts: affected.length > 0,
      conflict_count: affected.length,
      conflicts: affected,
    });
  } catch (error) {
    console.error('Preview Temporary Deactivation Error:', error);
    return res.status(500).json({ message: error.message });
  }
};

exports.applyTemporaryDeactivation = async (req, res) => {
    const t = await sequelize.transaction();

    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        const {
            start_time,
            end_time,
            reason,
            resolution_action,
            new_staff_id,
            reschedule_map,
        } = req.body;

        if (!start_time || !end_time) {
            await t.rollback();
            return res.status(400).json({ message: 'start_time dan end_time wajib diisi.' });
        }

        const startTime = new Date(start_time);
        const endTime = new Date(end_time);

        if (isNaN(startTime.getTime()) || isNaN(endTime.getTime()) || startTime >= endTime) {
            await t.rollback();
            return res.status(400).json({ message: 'Range waktu tidak valid.' });
        }

        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({
            where: { staff_id: staffId, barbershop_id: barbershopId, is_active: true },
            transaction: t,
        });

        if (!staff) {
            await t.rollback();
            return res.status(404).json({ message: 'Staff tidak ditemukan atau nonaktif.' });
        }

        const existingUnavailability = await StaffUnavailability.findOne({
            where: {
                staff_id: staffId,
                status: 'active',
                start_time: { [Op.lt]: endTime },
                end_time: { [Op.gt]: startTime },
            },
            transaction: t,
        });

        if (existingUnavailability) {
            await t.rollback();
            return res.status(409).json({
                message: 'Staff sudah memiliki jadwal nonaktif pada rentang waktu tersebut.',
            });
        }

        const conflicts = await getAffectedBookingsByRange(staffId, startTime, endTime);

        if (conflicts.length > 0) {
            if (!resolution_action) {
                await t.rollback();
                return res.status(409).json({
                    message: 'Ada booking bentrok. Pilih resolution_action: reassign atau reschedule.',
                    conflict_count: conflicts.length,
                    conflicts,
                });
            }

            if (!['reassign', 'reschedule'].includes(resolution_action)) {
                await t.rollback();
                return res.status(400).json({ message: 'resolution_action harus reassign atau reschedule.' });
            }

            if (resolution_action === 'reassign') {
                if (!new_staff_id) {
                    await t.rollback();
                    return res.status(400).json({ message: 'new_staff_id wajib untuk reassign.' });
                }

                const newStaff = await Staff.findOne({
                    where: { staff_id: new_staff_id, barbershop_id: barbershopId, is_active: true },
                    transaction: t,
                });

                if (!newStaff) {
                    await t.rollback();
                    return res.status(404).json({ message: 'Staff pengganti tidak ditemukan atau nonaktif.' });
                }

                if (new_staff_id === staffId) {
                    await t.rollback();
                    return res.status(400).json({ message: 'Staff pengganti harus berbeda dari staff yang dinonaktifkan.' });
                }

                const bookingIds = conflicts.map((c) => c.booking_id);

                const collisionWithTargetStaff = await Booking.findAll({
                    where: {
                        staff_id: new_staff_id,
                        status: { [Op.in]: ['confirmed', 'pending_payment'] },
                        [Op.or]: conflicts.map((c) => ({
                            booking_time: { [Op.lt]: c.end_time },
                            end_time: { [Op.gt]: c.booking_time },
                        })),
                    },
                    transaction: t,
                });

                if (collisionWithTargetStaff.length > 0) {
                    await t.rollback();
                    return res.status(409).json({
                        message: 'Staff pengganti memiliki jadwal bentrok.',
                        conflicts: collisionWithTargetStaff.length,
                    });
                }

                await Booking.update(
                    { staff_id: new_staff_id },
                    {
                        where: { booking_id: { [Op.in]: bookingIds } },
                        transaction: t,
                    }
                );
            }

            if (resolution_action === 'reschedule') {
                if (!Array.isArray(reschedule_map) || reschedule_map.length === 0) {
                    await t.rollback();
                    return res.status(400).json({
                        message: 'reschedule_map wajib diisi. Format: [{ booking_id, new_booking_time }]',
                    });
                }

                for (const conflict of conflicts) {
                    const mapping = reschedule_map.find((item) => item.booking_id === conflict.booking_id);

                    if (!mapping || !mapping.new_booking_time) {
                        await t.rollback();
                        return res.status(400).json({
                            message: `Booking ${conflict.booking_id} belum memiliki jadwal baru.`,
                        });
                    }

                    const newStart = new Date(mapping.new_booking_time);
                    if (isNaN(newStart.getTime())) {
                        await t.rollback();
                        return res.status(400).json({
                            message: `Waktu baru untuk booking ${conflict.booking_id} tidak valid.`,
                        });
                    }

                    const durationMinutes = conflict.duration_minutes || 30;
                    const newEnd = new Date(newStart.getTime() + durationMinutes * 60000);

                    if (newStart < endTime && newEnd > startTime) {
                        await t.rollback();
                        return res.status(400).json({
                            message: `Booking ${conflict.booking_id} masih bentrok dengan periode nonaktif staff.`,
                        });
                    }

                    const bookingCollision = await Booking.findOne({
                        where: {
                            booking_id: { [Op.ne]: conflict.booking_id },
                            staff_id: staffId,
                            status: { [Op.in]: ['confirmed', 'pending_payment'] },
                            booking_time: { [Op.lt]: newEnd },
                            end_time: { [Op.gt]: newStart },
                        },
                        transaction: t,
                    });

                    if (bookingCollision) {
                        await t.rollback();
                        return res.status(409).json({
                            message: `Jadwal baru booking ${conflict.booking_id} bentrok dengan booking lain.`,
                        });
                    }

                    await Booking.update(
                        {
                            original_booking_time: conflict.booking_time,
                            booking_time: newStart,
                            end_time: newEnd,
                                // Owner-triggered reschedule should not consume customer's 1x late-reschedule quota.
                            reschedule_reason: 'owner_staff_unavailable',
                        },
                        {
                            where: { booking_id: conflict.booking_id },
                            transaction: t,
                        }
                    );
                }
            }
        }

        const unavailability = await StaffUnavailability.create(
            {
                staff_id: staffId,
                barbershop_id: barbershopId,
                start_time: startTime,
                end_time: endTime,
                reason: reason || null,
                status: 'active',
            },
            { transaction: t }
        );

        await t.commit();

        return res.status(200).json({
            message: 'Nonaktif sementara berhasil disimpan.',
            unavailability,
            resolved_conflicts: conflicts.length,
        });
    } catch (error) {
        await t.rollback();
        console.error('Apply Temporary Deactivation Error:', error);
        return res.status(500).json({ message: error.message });
    }
};
