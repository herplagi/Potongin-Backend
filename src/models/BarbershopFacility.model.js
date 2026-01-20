// backend/src/models/BarbershopFacility.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BarbershopFacility = sequelize.define('BarbershopFacility', {
  facility_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Nama fasilitas (WiFi, AC, Parkir, dll)',
  },
  icon: {
    type: DataTypes.STRING(50),
    defaultValue: 'check-circle',
    comment: 'Icon name for frontend',
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
}, {
  tableName: 'BarbershopFacility',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = BarbershopFacility;