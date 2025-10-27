// src/models/Staff.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Barbershop = require('./Barbershop.model');

const Staff = sequelize.define('Staff', {
  staff_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  barbershop_id: { 
    type: DataTypes.UUID,
    allowNull: false,
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

// relasi: 
Staff.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
Barbershop.hasMany(Staff, { foreignKey: 'barbershop_id', as: 'staff' });

module.exports = Staff;