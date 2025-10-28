// src/models/Review.model.js - FIXED VERSION
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User.model');
const Barbershop = require('./Barbershop.model');
const Booking = require('./Booking.model');

const Review = sequelize.define('Review', {
    review_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    booking_id: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'bookings', key: 'booking_id' }
    },
    customer_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'users', key: 'user_id' }
    },
    barbershop_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: 'barbershops', key: 'barbershop_id' }
    },
    rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
            min: 1,
            max: 5
        },
        comment: 'Rating 1-5 bintang'
    },
    title: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    comment: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    // ✅ FIXED: Gunakan status enum, hapus is_approved
    status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'approved', // Auto-approve by default
        allowNull: false,
        comment: 'Status moderasi review'
    },
    is_flagged: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        comment: 'Ditandai untuk review manual'
    },
    admin_note: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Catatan dari admin'
    },
    rejection_reason: {
        type: DataTypes.TEXT,
        allowNull: true,
        comment: 'Alasan penolakan jika ditolak'
    },
    moderated_by: {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'user_id' }
    },
    moderated_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
}, {
    tableName: 'reviews',
    timestamps: true,
});

// Relasi
Review.belongsTo(User, { as: 'customer', foreignKey: 'customer_id' });
Review.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
Review.belongsTo(Booking, { foreignKey: 'booking_id' });
Review.belongsTo(User, { as: 'moderator', foreignKey: 'moderated_by' });

// Relasi balik
User.hasMany(Review, { foreignKey: 'customer_id' });
Barbershop.hasMany(Review, { foreignKey: 'barbershop_id' });
Booking.hasOne(Review, { foreignKey: 'booking_id' });

module.exports = Review;