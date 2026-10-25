import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";

export const PRICE_TIERS = Object.freeze({
  RETAIL: "RETAIL",
  DEALER: "DEALER",
  CUSTOMIZED: "CUSTOMIZED",
});

class Customer extends Model {}

Customer.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(150), allowNull: false },
    phone: { type: DataTypes.STRING(15), allowNull: true },
    email: { type: DataTypes.STRING(254), allowNull: true },
    priceTier: {
      type: DataTypes.ENUM(...Object.values(PRICE_TIERS)),
      allowNull: false,
      defaultValue: PRICE_TIERS.RETAIL,
    },
    gstin: { type: DataTypes.STRING(15), allowNull: true },
    stateCode: { type: DataTypes.STRING(2), allowNull: true },
    billingAddress: { type: DataTypes.TEXT, allowNull: true },
    deliveryAddress: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: "Customer",
    tableName: "customers",
    indexes: [
      { name: "customers_phone", unique: true, fields: ["phone"] },
      { name: "customers_name", fields: ["name"] },
    ],
  },
);

export default Customer;
