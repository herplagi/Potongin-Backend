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
        type: DataTypes.ENUM('pending_payment', 'confirmed', 'completed', 'cancelled', 'no_show'),
        allowNull: false,
        defaultValue: 'pending_payment',
    },
    total_price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
    },
    // ✅ NEW: Midtrans payment fields
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
}, {
    tableName: 'bookings',
    timestamps: true,
});

Booking.belongsTo(User, { as: 'customer', foreignKey: 'customer_id' });
Booking.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
Booking.belongsTo(Service, { foreignKey: 'service_id' });
Booking.belongsTo(Staff, { foreignKey: 'staff_id' });

module.exports = Booking;