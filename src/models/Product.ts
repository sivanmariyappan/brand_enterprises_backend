import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";

export const PRICING_METHODS = Object.freeze({
  NONE: "NONE",
  SQFT: "SQFT",
  RUNNING_FEET: "RUNNING_FEET",
});

class Product extends Model {}

Product.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    code: { type: DataTypes.STRING(30), allowNull: false },
    name: { type: DataTypes.STRING(150), allowNull: false },
    categoryId: { type: DataTypes.INTEGER, allowNull: true },
    brandId: { type: DataTypes.INTEGER, allowNull: true },
    pvcTypeId: { type: DataTypes.INTEGER, allowNull: true },
    valueAddedId: { type: DataTypes.INTEGER, allowNull: true },
    unitId: { type: DataTypes.INTEGER, allowNull: true },
    pricingMethod: {
      type: DataTypes.ENUM(...Object.values(PRICING_METHODS)),
      allowNull: false,
      defaultValue: PRICING_METHODS.NONE,
    },
    hsnCode: { type: DataTypes.STRING(12), allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: "Product",
    tableName: "products",
    indexes: [
      { name: "products_code", unique: true, fields: ["code"] },
      { name: "products_name", fields: ["name"] },
    ],
  },
);

export default Product;
