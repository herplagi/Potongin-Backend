const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Barbershop = require('./Barbershop.model');

const Service = sequelize.define('Service', {
  service_id: {
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
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  // --- PASTIKAN NAMA PROPERTI DI SINI BENAR ---
  duration_minutes: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  // ------------------------------------------
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
}, {
  tableName: 'services',
  timestamps: true,
});

// Definisikan relasi
Service.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
Barbershop.hasMany(Service, { foreignKey: 'barbershop_id', as: 'services' });

module.exports = Service;