// src/controllers/schedule.controller.js
const Barbershop = require('../models/Barbershop.model');
const BarbershopSchedule = require('../models/BarbershopSchedule.model');

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

// ✅ Get schedule untuk barbershop
exports.getSchedule = async (req, res) => {
    try {
        const { barbershopId } = req.params;
        const ownerId = req.user.id;

        await verifyOwnership(ownerId, barbershopId);

        const schedules = await BarbershopSchedule.findAll({
            where: { barbershop_id: barbershopId },
            order: [
                [
                    sequelize.literal(`FIELD(day_of_week, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu')`)
                ]
            ]
        });

        // Jika belum ada schedule, buat default
        if (schedules.length === 0) {
            const defaultSchedules = await createDefaultSchedules(barbershopId);
            return res.status(200).json(defaultSchedules);
        }

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
        const { schedules } = req.body; // Array of schedule objects

        await verifyOwnership(ownerId, barbershopId);

        if (!Array.isArray(schedules)) {
            return res.status(400).json({ message: 'Schedules harus berupa array' });
        }

        // Update atau create untuk setiap hari
        const updatePromises = schedules.map(async (schedule) => {
            const { day_of_week, open_time, close_time, is_open } = schedule;

            return await BarbershopSchedule.upsert({
                barbershop_id: barbershopId,
                day_of_week,
                open_time: is_open ? open_time : null,
                close_time: is_open ? close_time : null,
                is_open
            }, {
                conflictFields: ['barbershop_id', 'day_of_week']
            });
        });

        await Promise.all(updatePromises);

        // Fetch updated schedules
        const updatedSchedules = await BarbershopSchedule.findAll({
            where: { barbershop_id: barbershopId },
            order: [
                [
                    sequelize.literal(`FIELD(day_of_week, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu')`)
                ]
            ]
        });

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
        const { barbershopId, scheduleId } = req.params;
        const ownerId = req.user.id;
        const { open_time, close_time, is_open } = req.body;

        await verifyOwnership(ownerId, barbershopId);

        const schedule = await BarbershopSchedule.findOne({
            where: {
                schedule_id: scheduleId,
                barbershop_id: barbershopId
            }
        });

        if (!schedule) {
            return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
        }

        await schedule.update({
            open_time: is_open ? open_time : null,
            close_time: is_open ? close_time : null,
            is_open
        });

        res.status(200).json({
            message: 'Jadwal berhasil diperbarui',
            schedule
        });
    } catch (error) {
        console.error('Update single day error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// Helper function untuk membuat default schedules
async function createDefaultSchedules(barbershopId) {
    const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
    const defaultSchedules = [];

    for (const day of days) {
        const schedule = await BarbershopSchedule.create({
            barbershop_id: barbershopId,
            day_of_week: day,
            open_time: day === 'Minggu' ? null : '09:00:00',
            close_time: day === 'Minggu' ? null : '21:00:00',
            is_open: day !== 'Minggu'
        });
        defaultSchedules.push(schedule);
    }

    return defaultSchedules;
}

// Import sequelize untuk ordering
const sequelize = require('../config/database');