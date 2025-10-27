// src/middleware/uploadStaffPhotos.middleware.js
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Pastikan folder exists
const uploadDir = 'public/uploads/staff-photos/';
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage untuk foto staff
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'staff-' + uniqueSuffix + path.extname(file.originalname));
    }
});

// Filter untuk memastikan hanya gambar
const imageFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('Hanya file gambar (JPEG, JPG, PNG) yang diizinkan!'));
    }
};

const uploadStaffPhoto = multer({
    storage: storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
    fileFilter: imageFilter,
});

module.exports = uploadStaffPhoto;