const Barbershop = require('../models/Barbershop.model');
const Staff = require('../models/Staff.model');

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

// Membuat staf baru
exports.createStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const { name, photo_url, specialty } = req.body;
        if (!name) return res.status(400).json({ message: 'Nama staf wajib diisi.' });

        const newStaff = await Staff.create({
            barbershop_id: barbershopId,
            name,
            photo_url,
            specialty,
        });

        res.status(201).json({ message: 'Staf baru berhasil ditambahkan.', staff: newStaff });
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

// Mendapatkan semua staf dari barbershop tertentu
exports.getStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staffList = await Staff.findAll({ where: { barbershop_id: barbershopId } });
        res.status(200).json(staffList);
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

// Mengupdate data staf
exports.updateStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({ where: { staff_id: staffId, barbershop_id: barbershopId } });
        if (!staff) return res.status(404).json({ message: 'Staf tidak ditemukan atau Anda tidak punya hak akses.' });
        
        await staff.update(req.body);
        res.status(200).json({ message: 'Data staf berhasil diperbarui.', staff });
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

// Menghapus staf
exports.deleteStaff = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, staffId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const staff = await Staff.findOne({ where: { staff_id: staffId, barbershop_id: barbershopId } });
        if (!staff) return res.status(404).json({ message: 'Staf tidak ditemukan atau Anda tidak punya hak akses.' });

        await staff.destroy();
        res.status(200).json({ message: 'Staf berhasil dihapus.' });
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};