// src/models/Staff.model.js - FIXED VERSION
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Staff = sequelize.define('Staff', {
  staff_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  barbershop_id: { 
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'barbershops',
      key: 'barbershop_id'
    }
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  picture: {
    type: DataTypes.STRING,
    allowNull: true, 
  },
  specialty: { 
    type: DataTypes.STRING,
    allowNull: true,
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
}, {
  tableName: 'staff',
  timestamps: true,
});

module.exports = Staff;