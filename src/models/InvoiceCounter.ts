import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";

class InvoiceCounter extends Model {}

InvoiceCounter.init(
  {
    series: { type: DataTypes.STRING(30), primaryKey: true },
    lastNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, modelName: "InvoiceCounter", tableName: "invoice_counters" },
);

export default InvoiceCounter;
