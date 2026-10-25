import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";
import { money, userId } from "./columns.js";

export const CHANNELS = Object.freeze({ POS: "POS", SALES_ORDER: "SALES_ORDER" });
export const INVOICE_STATUS = Object.freeze({
  COMPLETED: "COMPLETED",
  PARTIALLY_RETURNED: "PARTIALLY_RETURNED",
  RETURNED: "RETURNED",
  CANCELLED: "CANCELLED",
});
export const PAYMENT_STATUS = Object.freeze({ PAID: "PAID", PARTIAL: "PARTIAL", UNPAID: "UNPAID" });

class Invoice extends Model {}

Invoice.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    channel: { type: DataTypes.ENUM(...Object.values(CHANNELS)), allowNull: false },
    invoiceNumber: { type: DataTypes.STRING(30), allowNull: false },
    invoiceDate: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    dated: { type: DataTypes.DATEONLY, allowNull: true },
    dueDate: { type: DataTypes.DATEONLY, allowNull: true },
    cashierId: userId({ allowNull: false }),
    salesRepId: userId(),
    customerId: { type: DataTypes.INTEGER, allowNull: true },
    customerName: { type: DataTypes.STRING(150), allowNull: true },
    customerPhone: { type: DataTypes.STRING(15), allowNull: true },
    customerGstin: { type: DataTypes.STRING(15), allowNull: true },
    placeOfSupplyStateCode: { type: DataTypes.STRING(2), allowNull: true },
    billingAddress: { type: DataTypes.TEXT, allowNull: true },
    deliveryAddress: { type: DataTypes.TEXT, allowNull: true },
    buyerRef: { type: DataTypes.STRING(100), allowNull: true },
    paymentTerms: { type: DataTypes.STRING(150), allowNull: true },
    summary: { type: DataTypes.STRING(255), allowNull: true },
    deliveryMode: { type: DataTypes.STRING(100), allowNull: true },
    customerNotes: { type: DataTypes.TEXT, allowNull: true },
    privateNotes: { type: DataTypes.TEXT, allowNull: true },
    taxType: { type: DataTypes.ENUM("INTRA", "INTER"), allowNull: false, defaultValue: "INTRA" },
    billDiscountType: { type: DataTypes.ENUM("PERCENT", "AMOUNT"), allowNull: true },
    billDiscountValue: money(),
    subtotal: money(),
    lineDiscountTotal: money(),
    billDiscountTotal: money(),
    discountTotal: money(),
    taxableTotal: money(),
    cgstTotal: money(),
    sgstTotal: money(),
    igstTotal: money(),
    gstTotal: money(),
    freightCharges: money(),
    roundOff: money(),
    grandTotal: money(),
    amountPaid: money(),
    refundedTotal: money(),
    paymentStatus: {
      type: DataTypes.ENUM(...Object.values(PAYMENT_STATUS)),
      allowNull: false,
      defaultValue: PAYMENT_STATUS.UNPAID,
    },
    status: {
      type: DataTypes.ENUM(...Object.values(INVOICE_STATUS)),
      allowNull: false,
      defaultValue: INVOICE_STATUS.COMPLETED,
    },
    cancelReason: { type: DataTypes.STRING(255), allowNull: true },
    cancelledBy: userId(),
    cancelledAt: { type: DataTypes.DATE, allowNull: true },
  },
  {
    sequelize,
    modelName: "Invoice",
    tableName: "invoices",
    indexes: [
      { name: "invoices_number", unique: true, fields: ["invoice_number"] },
      { name: "invoices_channel_date", fields: ["channel", "invoice_date"] },
      { name: "invoices_customer", fields: ["customer_id"] },
    ],
  },
);

export default Invoice;
