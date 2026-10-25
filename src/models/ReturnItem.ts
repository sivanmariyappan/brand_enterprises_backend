import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";
import { money, quantity } from "./columns.js";

class ReturnItem extends Model {}

ReturnItem.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    returnId: { type: DataTypes.INTEGER, allowNull: false },
    invoiceItemId: { type: DataTypes.INTEGER, allowNull: false },
    variantId: { type: DataTypes.INTEGER, allowNull: false },
    pieces: quantity(),
    taxableAmount: money(),
    gstAmount: money(),
    refundAmount: money(),
  },
  {
    sequelize,
    modelName: "ReturnItem",
    tableName: "return_items",
    indexes: [{ name: "return_items_return", fields: ["return_id"] }],
  },
);

export default ReturnItem;
