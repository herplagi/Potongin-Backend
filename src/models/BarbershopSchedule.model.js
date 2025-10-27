// // src/models/BarbershopSchedule.model.js
// const { DataTypes } = require('sequelize');
// const sequelize = require('../config/database');
// const Barbershop = require('./Barbershop.model');

// const BarbershopSchedule = sequelize.define('BarbershopSchedule', {
//     schedule_id: {
//         type: DataTypes.UUID,
//         defaultValue: DataTypes.UUIDV4,
//         primaryKey: true,
//     },
//     barbershop_id: {
//         type: DataTypes.UUID,
//         allowNull: false,
//         references: { model: 'barbershops', key: 'barbershop_id' }
//     },
//     day_of_week: {
//         type: DataTypes.ENUM('Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'),
//         allowNull: false,
//     },
//     open_time: {
//         type: DataTypes.TIME,
//         allowNull: true,
//         comment: 'Jam buka (HH:MM:SS format)'
//     },
//     close_time: {
//         type: DataTypes.TIME,
//         allowNull: true,
//         comment: 'Jam tutup (HH:MM:SS format)'
//     },
//     is_open: {
//         type: DataTypes.BOOLEAN,
//         allowNull: false,
//         defaultValue: true,
//         comment: 'Apakah barbershop buka di hari ini'
//     },
// }, {
//     tableName: 'barbershop_schedules',
//     timestamps: true,
//     indexes: [
//         {
//             unique: true,
//             fields: ['barbershop_id', 'day_of_week']
//         }
//     ]
// });

// // Relasi
// BarbershopSchedule.belongsTo(Barbershop, { foreignKey: 'barbershop_id' });
// Barbershop.hasMany(BarbershopSchedule, { foreignKey: 'barbershop_id', as: 'schedules' });

// module.exports = BarbershopSchedule;