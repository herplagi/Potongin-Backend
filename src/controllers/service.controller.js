// src/controllers/service.controller.js

const Barbershop = require('../models/Barbershop.model');
const Service = require('../models/Service.model');
const User = require('../models/User.model');

// FUNGSI HELPER UNTUK MEMVERIFIKASI KEPEMILIKAN
const verifyOwnerAndGetBarbershop = async (ownerId, barbershopId) => {
    // --- LOGGING UNTUK DEBUGGING ---
    console.log("========================================");
    console.log("Memverifikasi Kepemilikan...");
    console.log("ID Owner dari Token (ownerId):", ownerId);
    console.log("ID Barbershop dari URL (barbershopId):", barbershopId);
    console.log("========================================");
    // ------------------------------------

    if (!barbershopId) {
        throw new Error('Barbershop ID tidak disediakan.');
    }
    const barbershop = await Barbershop.findOne({
        where: {
            barbershop_id: barbershopId,
            owner_id: ownerId 
        }
    });

    if (!barbershop) {
        console.error("VERIFIKASI GAGAL: Tidak ditemukan barbershop yang cocok dengan kombinasi ownerId dan barbershopId di atas.");
        throw new Error('Barbershop tidak ditemukan atau Anda tidak punya hak akses.');
    }
    if (barbershop.approval_status !== 'approved') {
        console.error(`VERIFIKASI GAGAL: Barbershop ditemukan, namun statusnya adalah '${barbershop.approval_status}', bukan 'approved'.`);
        throw new Error('Aksi tidak diizinkan. Barbershop Anda belum disetujui oleh Admin.');
    }

    console.log("VERIFIKASI BERHASIL: Barbershop ditemukan dan statusnya 'approved'.");
    return barbershop;
};

// --- SEMUA FUNGSI TERKAIT LAYANAN SEKARANG DI SINI ---

exports.createService = async (req, res) => {
  try {
    const ownerId = req.user.id;
    const { barbershopId } = req.params;
    const barbershop = await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

    // --- PERBAIKAN UTAMA DI SINI ---
    // Pastikan nama variabelnya 'duration_minutes' agar cocok dengan frontend dan model
    const { name, description, price, duration_minutes } = req.body;
    
    const newService = await Service.create({
      barbershop_id: barbershop.barbershop_id,
      name, 
      description, 
      price, 
      duration_minutes, // <-- Gunakan variabel yang benar di sini
    });

    res.status(201).json({ message: 'Layanan berhasil dibuat.', service: newService });
  } catch (error) {
    console.error("CREATE SERVICE ERROR:", error);
    res.status(403).json({ message: error.message });
  }
};

exports.getServices = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId } = req.params;
        // PERBAIKAN: Simpan juga di sini untuk konsistensi, meskipun tidak langsung digunakan
        const barbershop = await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const services = await Service.findAll({ where: { barbershop_id: barbershop.barbershop_id, is_active: true } });
        res.status(200).json(services);
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

exports.updateService = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, serviceId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const service = await Service.findOne({ where: { service_id: serviceId, barbershop_id: barbershopId } });
        if (!service) {
            return res.status(404).json({ message: 'Layanan tidak ditemukan.' });
        }
        
        await service.update(req.body);
        res.status(200).json({ message: 'Layanan berhasil diperbarui.', service });
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

exports.deleteService = async (req, res) => {
    try {
        const ownerId = req.user.id;
        const { barbershopId, serviceId } = req.params;
        await verifyOwnerAndGetBarbershop(ownerId, barbershopId);

        const service = await Service.findOne({ where: { service_id: serviceId, barbershop_id: barbershopId } });
        if (!service) {
            return res.status(404).json({ message: 'Layanan tidak ditemukan.' });
        }
        
        await service.update({ is_active: false });
        res.status(200).json({ message: 'Layanan berhasil dinonaktifkan.' });
    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};