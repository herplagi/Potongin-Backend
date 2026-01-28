// src/models/Barbershop.model.js - TAMBAHKAN DI AKHIR FILE
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User.model');

const Barbershop = sequelize.define('Barbershop', {
  barbershop_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  owner_id: {
    type: DataTypes.UUID,
    allowNull: false,
    references: { model: 'users', key: 'user_id' }
  },
  name: { type: DataTypes.STRING, allowNull: false },
  address: { type: DataTypes.STRING, allowNull: false },
  city: { type: DataTypes.STRING, allowNull: false },
  opening_hours: { type: DataTypes.JSON, allowNull: true },
  approval_status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
    allowNull: false,
  },
  verified_by: {
    type: DataTypes.UUID,
    allowNull: true,
    references: { model: 'users', key: 'user_id' }
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  ktp_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  permit_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  latitude: {
    type: DataTypes.DECIMAL(10, 8),
    allowNull: true,
  },
  longitude: {
    type: DataTypes.DECIMAL(11, 8),
    allowNull: true,
  },
  main_image_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
    comment: 'Deskripsi barbershop, bisa berisi fasilitas, suasana, dll.'
  }
}, { tableName: 'barbershops', timestamps: true });

// User relations
Barbershop.belongsTo(User, { foreignKey: 'owner_id', as: 'owner' });
Barbershop.belongsTo(User, { foreignKey: 'verified_by', as: 'verifier' });

// Facilities relations
const BarbershopFacility = require('./BarbershopFacility.model');
Barbershop.belongsToMany(BarbershopFacility, {
  through: 'BarbershopHasFacility',
  as: 'facilities',
  foreignKey: 'barbershop_id',
  otherKey: 'facility_id',
});

BarbershopFacility.belongsToMany(Barbershop, {
  through: 'BarbershopHasFacility',
  foreignKey: 'facility_id',
  otherKey: 'barbershop_id',
});

// ✅ Staff relations - TAMBAHKAN INI
const Staff = require('./Staff.model');
Barbershop.hasMany(Staff, { 
  foreignKey: 'barbershop_id', 
  as: 'staff' 
});
Staff.belongsTo(Barbershop, { 
  foreignKey: 'barbershop_id' 
});

module.exports = Barbershop;