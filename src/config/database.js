const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    dialect: 'mysql',
    port: process.env.DB_PORT || 3306,
    define: {
      // --- KONFIGURASI ZONA WAKTU ---
      timezone: '+07:00', // <-- TAMBAHKAN/UBAH INI MENJADI WIB (+07:00)
      // ----------------------------
    },
    timezone: '+07:00', 
  }
);

module.exports = sequelize;