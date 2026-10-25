import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";

export const ROLES = Object.freeze({ ADMIN: "ADMIN", CASHIER: "CASHIER" });

class User extends Model {}

User.init(
  {
    id: {
      type: DataTypes.STRING(36),
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: "",
    },
    email: {
      type: DataTypes.STRING(254),
      allowNull: false,
      // Uniqueness comes from the named index below; declaring it here too
      // makes sync({ alter: true }) add a duplicate index on every restart.
      validate: { isEmail: true },
      set(value) {
        this.setDataValue("email", value.trim().toLowerCase());
      },
    },
    passwordHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "password_hash",
    },
    role: {
      type: DataTypes.ENUM(...Object.values(ROLES)),
      allowNull: false,
      defaultValue: ROLES.CASHIER,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    resetTokenHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "reset_token_hash",
    },
    resetTokenExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "reset_token_expires_at",
    },
  },
  {
    sequelize,
    modelName: "User",
    tableName: "users",
    indexes: [{ name: "users_email", unique: true, fields: ["email"] }],
  },
);

export default User;
