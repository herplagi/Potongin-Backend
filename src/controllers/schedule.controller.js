// src/controllers/schedule.controller.js
const Barbershop = require('../models/Barbershop.model');

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

// ✅ Get schedule dari opening_hours
exports.getSchedule = async (req, res) => {
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;

        const barbershop = await verifyOwnership(ownerId, barbershopId);

        // Parse opening_hours dari JSON
        let openingHours = barbershop.opening_hours;
        if (typeof openingHours === 'string') {
            openingHours = JSON.parse(openingHours);
        }

        // Format menjadi array untuk kemudahan di frontend
        const schedules = Object.entries(openingHours).map(([day, schedule]) => ({
            day_of_week: day,
            open_time: schedule.buka || null,
            close_time: schedule.tutup || null,
            is_open: schedule.aktif || false
        }));

        // Sort berdasarkan urutan hari
        const dayOrder = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
        schedules.sort((a, b) => dayOrder.indexOf(a.day_of_week) - dayOrder.indexOf(b.day_of_week));

        res.status(200).json(schedules);
    } catch (error) {
        console.error('Get schedule error:', error);
        res.status(403).json({ message: error.message });
    }
};

// ✅ Update schedule (batch update untuk semua hari)
exports.updateSchedule = async (req, res) => {
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;
        const { schedules } = req.body;

        const barbershop = await verifyOwnership(ownerId, barbershopId);

        if (!Array.isArray(schedules)) {
            return res.status(400).json({ message: 'Schedules harus berupa array' });
        }

        // Convert array schedules ke format opening_hours
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
            schedules: updatedSchedules
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
        const { day_of_week, open_time, close_time, is_open } = req.body;

        const barbershop = await verifyOwnership(ownerId, barbershopId);

        // Get current opening_hours
        let openingHours = barbershop.opening_hours;
        if (typeof openingHours === 'string') {
            openingHours = JSON.parse(openingHours);
        }

        // Update specific day
        openingHours[day_of_week] = {
            buka: is_open ? (open_time || '09:00') : '',
            tutup: is_open ? (close_time || '21:00') : '',
            aktif: is_open
        };

        // Save
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
            }
        });
    } catch (error) {
        console.error('Update single day error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};