// src/controllers/schedule.controller.js - UPDATED WITH CONFLICT HANDLING
const Barbershop = require('../models/Barbershop.model');
const Booking = require('../models/Booking.model');
const User = require('../models/User.model');
const Service = require('../models/Service.model');
const { Op } = require('sequelize');

// Helper function untuk verifikasi kepemilikan
const verifyOwnership = async (ownerId, barbershopId) => {
    const barbershop = await Barbershop.findOne({
        where: { barbershop_id: barbershopId, owner_id: ownerId }
    });

    if (!barbershop) {
        throw new Error('Barbershop tidak ditemukan atau Anda tidak punya hak akses.');
    }

    if (barbershop.approval_status !== 'approved') {
        throw new Error('Barbershop belum disetujui oleh admin.');
    }

    return barbershop;
};

// Helper function untuk convert day name ke day index
const getDayIndex = (dayName) => {
    const days = {
        'Minggu': 0,
        'Senin': 1,
        'Selasa': 2,
        'Rabu': 3,
        'Kamis': 4,
        'Jumat': 5,
        'Sabtu': 6
    };
    return days[dayName];
};

// Helper function untuk cek booking yang terpengaruh
const checkAffectedBookings = async (barbershopId, schedules) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(now.getDate() + 30);

    // Ambil semua booking yang akan datang (confirmed/pending_payment)
    const upcomingBookings = await Booking.findAll({
        where: {
            barbershop_id: barbershopId,
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
                attributes: ['name']
            }
        ],
        order: [['booking_time', 'ASC']]
    });

    const affectedBookings = [];
    const conflictDetails = [];

    for (const booking of upcomingBookings) {
        const bookingDate = new Date(booking.booking_time);
        const dayOfWeek = bookingDate.toLocaleDateString('id-ID', { weekday: 'long' });
        const bookingTime = bookingDate.toTimeString().substring(0, 5);
        
        // Cari schedule untuk hari tersebut
        const daySchedule = schedules.find(s => s.day_of_week === dayOfWeek);
        
        if (daySchedule) {
            let hasConflict = false;
            let conflictReason = '';

            // Cek 1: Apakah hari tersebut ditutup
            if (!daySchedule.is_open) {
                hasConflict = true;
                conflictReason = 'Barbershop tutup';
            }
            // Cek 2: Apakah waktu booking di luar jam operasional baru
            else if (daySchedule.open_time && daySchedule.close_time) {
                if (bookingTime < daySchedule.open_time || bookingTime >= daySchedule.close_time) {
                    hasConflict = true;
                    conflictReason = `Waktu booking (${bookingTime}) di luar jam operasional baru (${daySchedule.open_time} - ${daySchedule.close_time})`;
                }
            }

            if (hasConflict) {
                affectedBookings.push(booking);
                conflictDetails.push({
                    booking_id: booking.booking_id,
                    customer_name: booking.customer?.name,
                    customer_phone: booking.customer?.phone_number,
                    service_name: booking.Service?.name,
                    booking_date: bookingDate.toLocaleDateString('id-ID', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    }),
                    booking_time: bookingTime,
                    day_of_week: dayOfWeek,
                    conflict_reason: conflictReason,
                    new_schedule: daySchedule.is_open 
                        ? `${daySchedule.open_time} - ${daySchedule.close_time}`
                        : 'TUTUP'
                });
            }
        }
    }

    return {
        hasConflicts: affectedBookings.length > 0,
        count: affectedBookings.length,
        bookings: affectedBookings,
        details: conflictDetails
    };
};

// ✅ Get schedule
exports.getSchedule = async (req, res) => {
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;

        const barbershop = await verifyOwnership(ownerId, barbershopId);

        let openingHours = barbershop.opening_hours;
        if (typeof openingHours === 'string') {
            openingHours = JSON.parse(openingHours);
        }

        const schedules = Object.entries(openingHours).map(([day, schedule]) => ({
            day_of_week: day,
            open_time: schedule.buka || null,
            close_time: schedule.tutup || null,
            is_open: schedule.aktif || false
        }));

        const dayOrder = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
        schedules.sort((a, b) => dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week));

        res.status(200).json(schedules);
    } catch (error) {
        console.error('Get schedule error:', error);
        res.status(403).json({ message: error.message });
    }
};

// ✅ Update schedule dengan validasi booking conflicts
exports.updateSchedule = async (req, res) => {
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;
        const { schedules, force_update } = req.body; // force_update untuk bypass warning

        const barbershop = await verifyOwnership(ownerId, barbershopId);

        if (!Array.isArray(schedules)) {
            return res.status(400).json({ message: 'Schedules harus berupa array' });
        }

        // ✅ CEK KONFLIK DENGAN BOOKING YANG ADA
        const conflictCheck = await checkAffectedBookings(barbershopId, schedules);

        // Jika ada konflik dan tidak force update, return warning
        if (conflictCheck.hasConflicts && !force_update) {
            return res.status(409).json({
                message: 'Perubahan jadwal akan mempengaruhi booking yang sudah ada',
                require_confirmation: true,
                affected_bookings: {
                    count: conflictCheck.count,
                    details: conflictCheck.details,
                    warning: 'Booking-booking ini akan berada di luar jam operasional baru atau pada hari tutup. Anda perlu menghubungi customer untuk reschedule atau cancel.'
                }
            });
        }

        // Lanjutkan update jika tidak ada konflik atau sudah force_update
        const newOpeningHours = {};
        
        schedules.forEach(schedule => {
            const { day_of_week, open_time, close_time, is_open } = schedule;
            
            newOpeningHours[day_of_week] = {
                buka: is_open ? (open_time || '09:00') : '',
                tutup: is_open ? (close_time || '21:00') : '',
                aktif: is_open
            };
        });

        // Update barbershop
        await barbershop.update({
            opening_hours: newOpeningHours
        });

        // ✅ Jika ada booking yang terpengaruh, tandai dengan catatan
        if (conflictCheck.hasConflicts) {
            // Bisa kirim notifikasi ke customer atau tandai booking
            console.log(`⚠️ ${conflictCheck.count} booking terpengaruh oleh perubahan jadwal`);
            // TODO: Implement notification system
        }

        // Return formatted schedules
        const updatedSchedules = Object.entries(newOpeningHours).map(([day, schedule]) => ({
            day_of_week: day,
            open_time: schedule.buka || null,
            close_time: schedule.tutup || null,
            is_open: schedule.aktif || false
        }));

        const dayOrder = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
        updatedSchedules.sort((a, b) => dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week));

        res.status(200).json({
            message: 'Jadwal berhasil diperbarui',
            schedules: updatedSchedules,
            affected_bookings: conflictCheck.hasConflicts ? {
                count: conflictCheck.count,
                message: 'Beberapa booking terpengaruh. Hubungi customer untuk reschedule.'
            } : null
        });
    } catch (error) {
        console.error('Update schedule error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ✅ Update single day schedule
exports.updateSingleDay = async (req, res) => {
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;
        const { day_of_week, open_time, close_time, is_open, force_update } = req.body;

        const barbershop = await verifyOwnership(ownerId, barbershopId);

        // Get current opening_hours
        let openingHours = barbershop.opening_hours;
        if (typeof openingHours === 'string') {
            openingHours = JSON.parse(openingHours);
        }

        // Buat array schedule dengan perubahan untuk hari tertentu
        const schedulesForCheck = Object.entries(openingHours).map(([day, schedule]) => {
            if (day === day_of_week) {
                return {
                    day_of_week: day,
                    open_time: is_open ? (open_time || '09:00') : null,
                    close_time: is_open ? (close_time || '21:00') : null,
                    is_open: is_open
                };
            }
            return {
                day_of_week: day,
                open_time: schedule.buka || null,
                close_time: schedule.tutup || null,
                is_open: schedule.aktif || false
            };
        });

        // ✅ CEK KONFLIK
        const conflictCheck = await checkAffectedBookings(barbershopId, schedulesForCheck);

        if (conflictCheck.hasConflicts && !force_update) {
            return res.status(409).json({
                message: `Perubahan jadwal hari ${day_of_week} akan mempengaruhi booking yang sudah ada`,
                require_confirmation: true,
                affected_bookings: {
                    count: conflictCheck.count,
                    details: conflictCheck.details
                }
            });
        }

        // Update specific day
        openingHours[day_of_week] = {
            buka: is_open ? (open_time || '09:00') : '',
            tutup: is_open ? (close_time || '21:00') : '',
            aktif: is_open
        };

        await barbershop.update({
            opening_hours: openingHours
        });

        res.status(200).json({
            message: 'Jadwal berhasil diperbarui',
            schedule: {
                day_of_week,
                open_time: is_open ? open_time : null,
                close_time: is_open ? close_time : null,
                is_open
            },
            affected_bookings: conflictCheck.hasConflicts ? {
                count: conflictCheck.count,
                message: 'Beberapa booking terpengaruh. Hubungi customer untuk reschedule.'
            } : null
        });
    } catch (error) {
        console.error('Update single day error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ✅ NEW: Get affected bookings (untuk preview sebelum update)
exports.previewScheduleConflicts = async (req, res) => {
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;
        const { schedules } = req.body;

        await verifyOwnership(ownerId, barbershopId);

        if (!Array.isArray(schedules)) {
            return res.status(400).json({ message: 'Schedules harus berupa array' });
        }

        const conflictCheck = await checkAffectedBookings(barbershopId, schedules);

        res.status(200).json({
            has_conflicts: conflictCheck.hasConflicts,
            affected_bookings_count: conflictCheck.count,
            details: conflictCheck.details
        });
    } catch (error) {
        console.error('Preview conflicts error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};