// src/controllers/auth.controller.js - FIXED VERSION
const User = require("../models/User.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const transporter = require("../config/email");
const resetPasswordEmail = require("../templates/resetPasswordEmail");

exports.register = async (req, res) => {
  try {
    const { name, email, password, phoneNumber, role } = req.body;

    if (!name || !email || !password || !phoneNumber) {
      return res.status(400).json({ message: "Semua kolom wajib diisi" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name: name,
      email: email,
      password: hashedPassword,
      phone_number: phoneNumber,
      role: role || "customer",
      is_customer: true,
      is_owner: false,
    });

    const userResponse = newUser.toJSON();
    delete userResponse.password;

    res.status(201).json({
      message: "User berhasil dibuat",
      user: userResponse,
    });
  } catch (error) {
    if (error.name === "SequelizeUniqueConstraintError") {
      return res
        .status(409)
        .json({ message: "Email atau nomor telepon sudah terdaftar." });
    }
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server", error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email: email } });
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Password salah" });
    }

    // ✅ FIXED: Tambahkan phone_number ke JWT payload
    const payload = {
      id: user.user_id,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number, // ✅ TAMBAHKAN INI
      role: user.role,
      is_customer: user.is_customer,
      is_owner: user.is_owner,
    };
    
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1h",
    });

    res.status(200).json({
      message: "Login berhasil",
      token: token,
    });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server", error: error.message });
  }
};

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findByPk(req.user.id, {
      attributes: { exclude: ["password"] },
    });
    if (!user) {
      return res.status(404).json({ message: "User tidak ditemukan" });
    }

    res.status(200).json(user);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Terjadi kesalahan pada server", error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email wajib diisi" });
    }

    // Find user by email
    const user = await User.findOne({ where: { email: email } });
    if (!user) {
      return res.status(404).json({ message: "Email tidak terdaftar" });
    }

    // Generate random token
    const resetToken = crypto.randomBytes(32).toString('hex');
    
    // Hash the token before storing it in database for security
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    // Set token expiry to 1 hour from now
    const resetTokenExpires = new Date(Date.now() + 3600000); // 1 hour

    // Save hashed token to database
    await user.update({
      reset_token: hashedToken,
      reset_token_expires: resetTokenExpires
    });

    // Create reset link with URL-encoded token (though hex is already URL-safe)
    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Reset Password - Potongin',
      html: resetPasswordEmail(resetLink, user.name)
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({
      message: "Email reset password telah dikirim. Silakan cek inbox Anda."
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server",
      error: error.message
    });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        message: "Token dan password baru wajib diisi"
      });
    }

    // Validate password length
    if (newPassword.length < 6) {
      return res.status(400).json({
        message: "Password minimal 6 karakter"
      });
    }

    // Hash the provided token to compare with stored hash
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token and check expiry in a single query to prevent timing attacks
    const { Op } = require('sequelize');
    const user = await User.findOne({
      where: {
        reset_token: hashedToken,
        reset_token_expires: {
          [Op.gt]: new Date() // Token must not be expired
        }
      }
    });

    if (!user) {
      return res.status(400).json({
        message: "Token tidak valid atau sudah expired"
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await user.update({
      password: hashedPassword,
      reset_token: null,
      reset_token_expires: null
    });

    res.status(200).json({
      message: "Password berhasil direset. Silakan login dengan password baru."
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      message: "Terjadi kesalahan pada server",
      error: error.message
    });
  }
};