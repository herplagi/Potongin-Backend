// backend/src/models/Booking.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User.model');
const Barbershop = require('./Barbershop.model');
const Service = require('./Service.model');
const Staff = require('./Staff.model');

const Booking = sequelize.define('Booking', {
    booking_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    customer_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    barbershop_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    service_id: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    staff_id: {
        type: DataTypes.UUID,
        allowNull: true,
    },
    booking_time: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    end_time: {
        type: DataTypes.DATE,
        allowNull: false,
    },
    status: {
        type: DataTypes.ENUM(
            'pending_payment',
            'confirmed',
            'checked_in',           // ✅ BARU
            'in_progress',          // ✅ BARU
            'awaiting_confirmation', // ✅ BARU
            'completed',
            'cancelled',
            'no_show'               // ✅ BARU (sudah ada tapi sekarang dipakai)
        ),
        allowNull: false,
        defaultValue: 'pending_payment',
    },
    total_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    
    // Payment fields
    payment_token: {
        type: DataTypes.STRING,
        allowNull: true,
    },
    payment_url: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    transaction_id: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
    },
    payment_status: {
        type: DataTypes.ENUM('pending', 'paid', 'expired', 'failed'),
        defaultValue: 'pending',
    },
    paid_at: {
        type: DataTypes.DATE,
        allowNull: true,
    },
    
    // ✅ CHECK-IN SYSTEM FIELDS (BARU)
    check_in_code: {
        type: DataTypes.STRING(6),
        allowNull: true,
        comment: 'PIN 6-digit untuk check-in',
    },
    qr_code_token: {
        type: DataTypes.STRING(64),
        allowNull: true,
        comment: 'Token unik untuk QR code',
    },
    checked_in_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Waktu customer check-in',
    },
    check_in_method: {
        type: DataTypes.ENUM('qr_code', 'pin', 'geofencing', 'manual'),
        allowNull: true,
        comment: 'Metode check-in yang digunakan',
    },
    service_started_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Waktu layanan dimulai oleh owner',
    },
    service_completed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Waktu layanan selesai (mark by owner)',
    },
    customer_confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Waktu customer konfirmasi layanan selesai',
    },
}, {
    tableName: 'bookings',
    timestamps: true,
});

// Relations
Booking.belongsTo(User, { as: 'customer', foreignKey: 'customer_id' });
Booking.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
Booking.belongsTo(Service, { foreignKey: 'service_id' });
Booking.belongsTo(Staff, { foreignKey: 'staff_id' });

module.exports = Booking;