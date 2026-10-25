import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";

export const MASTER_TYPES = Object.freeze({
  CATEGORY: "CATEGORY",
  BRAND: "BRAND",
  SIZE: "SIZE",
  COLOR: "COLOR",
  PVC_TYPE: "PVC_TYPE",
  VALUE_ADDED: "VALUE_ADDED",
  UNIT: "UNIT",
});

class Master extends Model {}

Master.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    type: { type: DataTypes.ENUM(...Object.values(MASTER_TYPES)), allowNull: false },
    name: { type: DataTypes.STRING(100), allowNull: false },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: "Master",
    tableName: "masters",
    indexes: [{ name: "masters_type_name", unique: true, fields: ["type", "name"] }],
  },
);

export default Master;
