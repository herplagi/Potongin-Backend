// src/controllers/staff.controller.js
const Barbershop = require('../models/Barbershop.model');
const Staff = require('../models/Staff.model');
const fs = require('fs');
const path = require('path');

// Fungsi helper baru yang lebih aman
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
        // Hapus file jika ada error
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(403).json({ message: error.message });
    }
};

// ✅ Mendapatkan semua staf dari barbershop tertentu (termasuk yang nonaktif)
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

        // Handle foto baru
        if (req.file) {
            // Hapus foto lama jika ada
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

// ✅ NEW: Menonaktifkan staf (soft delete)
exports.deactivateStaff = async (req, res) => {
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

        await staff.update({ is_active: false });
        res.status(200).json({ message: 'Staf berhasil dinonaktifkan.', staff });
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

// ✅ NEW: Mengaktifkan kembali staf
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

// ✅ Menghapus staf permanen (opsional)
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