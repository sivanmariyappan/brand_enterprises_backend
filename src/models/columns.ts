import { DataTypes } from "sequelize";

// Shared column definitions so money, quantity and rate columns use the same
// precision in every table.
export const money = (options = {}) => ({
  type: DataTypes.DECIMAL(12, 2),
  allowNull: false,
  defaultValue: 0,
  ...options,
});

export const quantity = (options = {}) => ({
  type: DataTypes.DECIMAL(12, 3),
  allowNull: false,
  defaultValue: 0,
  ...options,
});

export const percent = (options = {}) => ({
  type: DataTypes.DECIMAL(5, 2),
  allowNull: false,
  defaultValue: 0,
  ...options,
});

export const userId = (options = {}) => ({
  type: DataTypes.STRING(36),
  allowNull: true,
  ...options,
});
