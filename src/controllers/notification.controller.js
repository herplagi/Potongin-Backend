// src/controllers/notification.controller.js

const Notification = require('../models/Notification.model');
const User = require('../models/User.model');

exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id; // Pastikan authMiddleware sudah mengatur req.user.id
    console.log(`📥 Mengambil notifikasi untuk user ID: ${userId}`); // Log untuk debugging

    const limit = req.query.limit ? parseInt(req.query.limit) : 50;

    const notifications = await Notification.findAll({
      where: { user_id: userId },
      order: [['createdAt', 'DESC']],
      limit: limit,
    });

    console.log(`📤 Mengirim ${notifications.length} notifikasi.`); // Log untuk debugging
    res.status(200).json(notifications);
  } catch (error) {
    console.error("Gagal mengambil notifikasi:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    console.log(`🔢 Menghitung notifikasi belum dibaca untuk user ID: ${userId}`); // Log untuk debugging

    const count = await Notification.count({
      where: {
        user_id: userId,
        is_read: false,
      },
    });

    console.log(`📤 Jumlah notifikasi belum dibaca: ${count}`); // Log untuk debugging
    res.status(200).json({ count });
  } catch (error) {
    console.error("Gagal menghitung notifikasi belum dibaca:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Optional: Mark a single notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    const userId = req.user.id;

    const notification = await Notification.findOne({
      where: { notification_id: notificationId, user_id: userId },
    });

    if (!notification) {
      return res.status(404).json({ message: 'Notifikasi tidak ditemukan.' });
    }

    await notification.update({ is_read: true, read_at: new Date() });

    res.status(200).json({ message: 'Notifikasi ditandai sebagai dibaca.', notification });
  } catch (error) {
    console.error("Gagal menandai notifikasi sebagai dibaca:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Optional: Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.update(
      { is_read: true, read_at: new Date() },
      { where: { user_id: userId } }
    );

    res.status(200).json({ message: 'Semua notifikasi ditandai sebagai dibaca.' });
  } catch (error) {
    console.error("Gagal menandai semua notifikasi sebagai dibaca:", error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};