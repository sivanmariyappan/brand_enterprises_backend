import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";
import { quantity, userId } from "./columns.js";

export const MOVEMENT_TYPES = Object.freeze({
  SALE: "SALE",
  RETURN: "RETURN",
  CANCEL: "CANCEL",
  PURCHASE: "PURCHASE",
  ADJUSTMENT: "ADJUSTMENT",
  OPENING: "OPENING",
});

class StockMovement extends Model {}

StockMovement.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    variantId: { type: DataTypes.INTEGER, allowNull: false },
    type: { type: DataTypes.ENUM(...Object.values(MOVEMENT_TYPES)), allowNull: false },
    quantity: quantity(),
    balanceAfter: quantity(),
    referenceType: { type: DataTypes.STRING(20), allowNull: true },
    referenceId: { type: DataTypes.INTEGER, allowNull: true },
    note: { type: DataTypes.STRING(255), allowNull: true },
    userId: userId(),
  },
  {
    sequelize,
    modelName: "StockMovement",
    tableName: "stock_movements",
    indexes: [{ name: "stock_movements_variant", fields: ["variant_id", "created_at"] }],
  },
);

export default StockMovement;
