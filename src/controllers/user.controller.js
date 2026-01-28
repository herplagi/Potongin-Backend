// backend/src/controllers/user.controller.js - ADD THESE METHODS

const User = require('../models/User.model');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

// Existing methods...
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { name, phone_number } = req.body;

        if (!name || !phone_number) {
            return res.status(400).json({ message: 'Nama dan nomor telepon wajib diisi.' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan.' });
        }

        if (phone_number !== user.phone_number) {
            const existingUser = await User.findOne({ 
                where: { 
                    phone_number,
                    user_id: { [require('sequelize').Op.ne]: userId }
                }
            });
            
            if (existingUser) {
                return res.status(409).json({ message: 'Nomor telepon sudah digunakan.' });
            }
        }

        await user.update({ name, phone_number });

        const userResponse = user.toJSON();
        delete userResponse.password;

        res.status(200).json({ 
            message: 'Profil berhasil diperbarui',
            user: userResponse 
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.changePassword = async (req, res) => {
    try {
        const userId = req.user.id;
        const { current_password, new_password } = req.body;

        if (!current_password || !new_password) {
            return res.status(400).json({ 
                message: 'Password lama dan password baru wajib diisi.' 
            });
        }

        if (new_password.length < 6) {
            return res.status(400).json({ 
                message: 'Password baru minimal 6 karakter.' 
            });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan.' });
        }

        const isPasswordValid = await bcrypt.compare(current_password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Password lama tidak sesuai.' });
        }

        const hashedPassword = await bcrypt.hash(new_password, 10);
        await user.update({ password: hashedPassword });

        res.status(200).json({ message: 'Password berhasil diubah' });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ✅ NEW: Upload profile picture
exports.uploadProfilePicture = async (req, res) => {
    try {
        const userId = req.user.id;
        
        if (!req.file) {
            return res.status(400).json({ message: 'File gambar tidak ditemukan' });
        }

        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }

        // Hapus foto lama jika ada
        if (user.picture) {
            const oldPicturePath = path.join(__dirname, '../../public', user.picture);
            if (fs.existsSync(oldPicturePath)) {
                fs.unlinkSync(oldPicturePath);
            }
        }

        // Simpan path foto baru
        const pictureUrl = `/uploads/profile-pictures/${req.file.filename}`;
        await user.update({ picture: pictureUrl });

        const userResponse = user.toJSON();
        delete userResponse.password;

        res.status(200).json({
            message: 'Foto profil berhasil diupload',
            user: userResponse,
            picture_url: pictureUrl
        });
    } catch (error) {
        console.error('Upload profile picture error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

// ✅ NEW: Get current user profile
exports.getMyProfile = async (req, res) => {
    try {
        const userId = req.user.id;
        
        const user = await User.findByPk(userId, {
            attributes: { exclude: ['password', 'reset_token', 'reset_token_expires'] }
        });

        if (!user) {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }

        res.status(200).json(user);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

module.exports = exports;