const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  user_id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  phone_number: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
role: {
  type: DataTypes.ENUM('customer', 'owner', 'admin', 'customer_owner'),
  allowNull: false,
  defaultValue: 'customer',
},
// ✅ NEW: Multi-role flags
is_customer: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: true,
},
is_owner: {
  type: DataTypes.BOOLEAN,
  allowNull: false,
  defaultValue: false,
},
// END NEW
picture: {
  type: DataTypes.STRING,
  allowNull: true,
},
reset_token: {
  type: DataTypes.STRING,
  allowNull: true,
},
reset_token_expires: {
  type: DataTypes.DATE,
  allowNull: true,
},
}, {
  // Opsi tambahan
  tableName: 'users', 
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = User;