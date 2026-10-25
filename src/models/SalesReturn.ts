import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";
import { money, userId } from "./columns.js";

class SalesReturn extends Model {}

SalesReturn.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    returnNumber: { type: DataTypes.STRING(30), allowNull: false },
    invoiceId: { type: DataTypes.INTEGER, allowNull: false },
    reason: { type: DataTypes.STRING(255), allowNull: true },
    refundAmount: money(),
    refundMethod: { type: DataTypes.ENUM("CASH", "UPI", "CARD", "OTHER"), allowNull: false },
    processedBy: userId(),
  },
  {
    sequelize,
    modelName: "SalesReturn",
    tableName: "returns",
    indexes: [
      { name: "returns_number", unique: true, fields: ["return_number"] },
      { name: "returns_invoice", fields: ["invoice_id"] },
    ],
  },
);

export default SalesReturn;
