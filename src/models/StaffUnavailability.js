const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const StaffUnavailability = sequelize.define(
  "StaffUnavailability",
  {
    unavailability_id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    staff_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    barbershop_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    start_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    end_time: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM("active", "cancelled"),
      allowNull: false,
      defaultValue: "active",
    },
  },
  {
    tableName: "staff_unavailability",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
);

module.exports = StaffUnavailability;
