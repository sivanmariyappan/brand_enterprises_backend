import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";

class Setting extends Model {}

Setting.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    shopName: { type: DataTypes.STRING(150), allowNull: false, defaultValue: "Brand Enterprises" },
    address: { type: DataTypes.TEXT, allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    email: { type: DataTypes.STRING(254), allowNull: true },
    gstin: { type: DataTypes.STRING(15), allowNull: true },
    shopStateCode: { type: DataTypes.STRING(2), allowNull: false, defaultValue: "33" },
    invoiceFooter: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, modelName: "Setting", tableName: "settings" },
);

export default Setting;
