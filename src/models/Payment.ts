import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";
import { money, userId } from "./columns.js";

export const PAYMENT_METHODS = Object.freeze({ CASH: "CASH", UPI: "UPI", CARD: "CARD", OTHER: "OTHER" });

class Payment extends Model {}

Payment.init(
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    invoiceId: { type: DataTypes.INTEGER, allowNull: false },
    method: { type: DataTypes.ENUM(...Object.values(PAYMENT_METHODS)), allowNull: false },
    amount: money(),
    amountReceived: money(),
    changeAmount: money(),
    transactionRef: { type: DataTypes.STRING(100), allowNull: true },
    receivedBy: userId(),
  },
  {
    sequelize,
    modelName: "Payment",
    tableName: "payments",
    indexes: [{ name: "payments_invoice", fields: ["invoice_id"] }],
  },
);

export default Payment;
