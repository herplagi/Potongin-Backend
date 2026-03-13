const jwt = require("jsonwebtoken");
const User = require("../models/User.model");

const authMiddleware = async (req, res, next) => {
  const authHeader = req.header("authorization");

  if (!authHeader) {
    return res.status(401).json({ message: "Token tidak ditemukan" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ message: "Token tidak ditemukan" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findByPk(decoded.id, {
      attributes: [
        "user_id",
        "name",
        "email",
        "phone_number",
        "role",
        "is_customer",
        "is_owner",
      ],
    });

    if (!user) {
      return res.status(401).json({ message: "User tidak ditemukan" });
    }

    req.user = {
      id: user.user_id,
      name: user.name,
      email: user.email,
      phone_number: user.phone_number,
      role: user.role,
      is_customer: user.is_customer,
      is_owner: user.is_owner,
    };

    next();
  } catch (error) {
    if (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError") {
      return res.status(403).json({ message: "Token tidak valid atau expired" });
    }
    return res.status(500).json({ message: "Terjadi kesalahan autentikasi" });
  }
};

module.exports = authMiddleware;