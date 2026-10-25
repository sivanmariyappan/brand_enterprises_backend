import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";
import { money, percent, quantity } from "./columns.js";

// Everything describing the product is copied here at billing time, so later
// price or name changes never alter an issued invoice.
class InvoiceItem extends Model {}

InvoiceItem.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    invoiceId: { type: DataTypes.INTEGER, allowNull: false },
    variantId: { type: DataTypes.INTEGER, allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    productName: { type: DataTypes.STRING(150), allowNull: false },
    variantName: { type: DataTypes.STRING(150), allowNull: true },
    sku: { type: DataTypes.STRING(40), allowNull: false },
    hsnCode: { type: DataTypes.STRING(12), allowNull: true },
    size: { type: DataTypes.STRING(100), allowNull: true },
    color: { type: DataTypes.STRING(100), allowNull: true },
    unit: { type: DataTypes.STRING(30), allowNull: true },
    pricingMethod: { type: DataTypes.ENUM("NONE", "SQFT", "RUNNING_FEET"), allowNull: false, defaultValue: "NONE" },
    priceTier: { type: DataTypes.ENUM("RETAIL", "DEALER", "CUSTOMIZED"), allowNull: false, defaultValue: "RETAIL" },
    unitPrice: money(),
    priceOverridden: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    purchasePrice: money(),
    discountPercent: percent(),
    gstPercent: percent(),
    pieces: quantity(),
    length: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    width: { type: DataTypes.DECIMAL(10, 3), allowNull: true },
    quantity: quantity(),
    lineTotal: money(),
    itemDiscount: money(),
    billDiscountShare: money(),
    taxableAmount: money(),
    cgstAmount: money(),
    sgstAmount: money(),
    igstAmount: money(),
    gstAmount: money(),
    finalAmount: money(),
    returnedQuantity: quantity(),
  },
  {
    sequelize,
    modelName: "InvoiceItem",
    tableName: "invoice_items",
    indexes: [
      { name: "invoice_items_invoice", fields: ["invoice_id"] },
      { name: "invoice_items_variant", fields: ["variant_id"] },
    ],
  },
);

export default InvoiceItem;
