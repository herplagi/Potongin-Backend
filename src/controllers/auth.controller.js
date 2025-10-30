// src/controllers/auth.controller.js - FIXED VERSION
const User = require("../models/User.model");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

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