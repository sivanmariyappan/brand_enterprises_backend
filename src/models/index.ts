import User from "./User.js";
import Setting from "./Setting.js";
import Master from "./Master.js";
import Product from "./Product.js";
import ProductVariant from "./ProductVariant.js";
import StockMovement from "./StockMovement.js";
import Customer from "./Customer.js";
import InvoiceCounter from "./InvoiceCounter.js";
import Invoice from "./Invoice.js";
import InvoiceItem from "./InvoiceItem.js";
import Payment from "./Payment.js";
import SalesReturn from "./SalesReturn.js";
import ReturnItem from "./ReturnItem.js";

// No DB-level foreign keys: sequelize.sync({ alter: true }) re-adds every FK
// constraint on each restart in MySQL. Relationships are enforced by the
// services inside transactions, and FK columns are indexed on the models.
const noFk = { constraints: false };

Product.belongsTo(Master, { as: "category", foreignKey: "categoryId", ...noFk });
Product.belongsTo(Master, { as: "brand", foreignKey: "brandId", ...noFk });
Product.belongsTo(Master, { as: "pvcType", foreignKey: "pvcTypeId", ...noFk });
Product.belongsTo(Master, { as: "valueAdded", foreignKey: "valueAddedId", ...noFk });
Product.belongsTo(Master, { as: "unit", foreignKey: "unitId", ...noFk });

Product.hasMany(ProductVariant, { as: "variants", foreignKey: "productId", ...noFk });
ProductVariant.belongsTo(Product, { as: "product", foreignKey: "productId", ...noFk });
ProductVariant.belongsTo(Master, { as: "size", foreignKey: "sizeId", ...noFk });
ProductVariant.belongsTo(Master, { as: "color", foreignKey: "colorId", ...noFk });

ProductVariant.hasMany(StockMovement, { as: "movements", foreignKey: "variantId", ...noFk });
StockMovement.belongsTo(ProductVariant, { as: "variant", foreignKey: "variantId", ...noFk });
StockMovement.belongsTo(User, { as: "user", foreignKey: "userId", ...noFk });

Customer.hasMany(Invoice, { as: "invoices", foreignKey: "customerId", ...noFk });
Invoice.belongsTo(Customer, { as: "customer", foreignKey: "customerId", ...noFk });
Invoice.belongsTo(User, { as: "cashier", foreignKey: "cashierId", ...noFk });
Invoice.belongsTo(User, { as: "salesRep", foreignKey: "salesRepId", ...noFk });

Invoice.hasMany(InvoiceItem, { as: "items", foreignKey: "invoiceId", ...noFk });
InvoiceItem.belongsTo(Invoice, { as: "invoice", foreignKey: "invoiceId", ...noFk });
InvoiceItem.belongsTo(ProductVariant, { as: "variant", foreignKey: "variantId", ...noFk });

Invoice.hasMany(Payment, { as: "payments", foreignKey: "invoiceId", ...noFk });
Payment.belongsTo(Invoice, { as: "invoice", foreignKey: "invoiceId", ...noFk });

Invoice.hasMany(SalesReturn, { as: "returns", foreignKey: "invoiceId", ...noFk });
SalesReturn.belongsTo(Invoice, { as: "invoice", foreignKey: "invoiceId", ...noFk });
SalesReturn.belongsTo(User, { as: "processor", foreignKey: "processedBy", ...noFk });
SalesReturn.hasMany(ReturnItem, { as: "items", foreignKey: "returnId", ...noFk });
ReturnItem.belongsTo(SalesReturn, { as: "salesReturn", foreignKey: "returnId", ...noFk });
ReturnItem.belongsTo(InvoiceItem, { as: "invoiceItem", foreignKey: "invoiceItemId", ...noFk });

export {
  User,
  Setting,
  Master,
  Product,
  ProductVariant,
  StockMovement,
  Customer,
  InvoiceCounter,
  Invoice,
  InvoiceItem,
  Payment,
  SalesReturn,
  ReturnItem,
};
