import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";
import { money, percent, quantity } from "./columns.js";

class ProductVariant extends Model {}

ProductVariant.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    productId: { type: DataTypes.INTEGER, allowNull: false },
    sku: { type: DataTypes.STRING(40), allowNull: false },
    barcode: { type: DataTypes.STRING(64), allowNull: true },
    sizeId: { type: DataTypes.INTEGER, allowNull: true },
    colorId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING(150), allowNull: false, defaultValue: "" },
    hsnCode: { type: DataTypes.STRING(12), allowNull: true },
    purchasePrice: money(),
    retailPrice: money(),
    dealerPrice: money(),
    customizedPrice: money(),
    discountPercent: percent(),
    gstPercent: percent(),
    stockQuantity: quantity(),
    minStockLevel: quantity(),
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  {
    sequelize,
    modelName: "ProductVariant",
    tableName: "product_variants",
    indexes: [
      { name: "product_variants_sku", unique: true, fields: ["sku"] },
      { name: "product_variants_barcode", unique: true, fields: ["barcode"] },
      { name: "product_variants_product", fields: ["product_id"] },
    ],
  },
);

export default ProductVariant;
