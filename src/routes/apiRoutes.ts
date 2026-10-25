import { Router } from "express";
import { body, param, query } from "express-validator";
import * as catalog from "../controllers/catalogController.js";
import * as sales from "../controllers/salesController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validateRequest } from "../middleware/requestValidation.js";
import { MASTER_TYPES } from "../models/Master.js";
import { ROLES } from "../models/User.js";

const router = Router();
const adminOnly = requireRole(ROLES.ADMIN);
const validate = (...rules) => [...rules, validateRequest];

const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28];
const PRICE_TIERS = ["RETAIL", "DEALER", "CUSTOMIZED"];
const PAYMENT_METHODS = ["CASH", "UPI", "CARD", "OTHER"];
const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const idParam = (name = "id") => param(name).isInt({ min: 1 }).withMessage("Invalid id.");
const money = (field) => body(field).optional({ values: "null" }).isFloat({ min: 0 }).withMessage("Must be 0 or more.");
const optionalGstin = (field) =>
  body(field)
    .optional({ values: "falsy" })
    .customSanitizer((value) => String(value).trim().toUpperCase())
    .matches(GSTIN_PATTERN)
    .withMessage("Enter a valid 15-character GSTIN.");
const optionalPhone = (field) =>
  body(field).optional({ values: "falsy" }).trim().matches(/^[0-9+\- ]{6,15}$/).withMessage("Enter a valid phone number.");

router.use(requireAuth);

// Settings & users
router.get("/settings", catalog.getSettings);
router.put(
  "/settings",
  adminOnly,
  validate(
    body("shopName").optional().trim().notEmpty().withMessage("Shop name is required."),
    body("shopStateCode").optional().matches(/^\d{2}$/).withMessage("Select the shop's state."),
    optionalGstin("gstin"),
  ),
  catalog.updateSettings,
);

router.get("/users/lookup", catalog.lookupUsers);
router.get("/users", adminOnly, catalog.listUsers);
router.post(
  "/users",
  adminOnly,
  validate(
    body("name").trim().notEmpty().withMessage("Name is required."),
    body("email").trim().isEmail().withMessage("A valid email is required."),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters."),
    body("role").isIn(Object.values(ROLES)).withMessage("Choose a role."),
  ),
  catalog.createUser,
);
router.patch(
  "/users/:id",
  adminOnly,
  validate(
    body("name").optional().trim().notEmpty(),
    body("role").optional().isIn(Object.values(ROLES)),
    body("isActive").optional().isBoolean(),
    body("password").optional({ values: "falsy" }).isLength({ min: 8 }).withMessage("Password must be at least 8 characters."),
  ),
  catalog.updateUser,
);

// Masters
router.get("/masters", catalog.listMasters);
router.post(
  "/masters",
  adminOnly,
  validate(
    body("type").isIn(Object.values(MASTER_TYPES)).withMessage("Unknown list."),
    body("name").trim().notEmpty().withMessage("Name is required.").isLength({ max: 100 }),
  ),
  catalog.createMaster,
);
router.put(
  "/masters/:id",
  adminOnly,
  validate(idParam(), body("name").optional().trim().notEmpty(), body("isActive").optional().isBoolean()),
  catalog.updateMaster,
);

// Products
const productRules = [
  body("code").trim().notEmpty().withMessage("Product code is required.").isLength({ max: 30 }),
  body("name").trim().notEmpty().withMessage("Product name is required.").isLength({ max: 150 }),
  body("pricingMethod").optional().isIn(["NONE", "SQFT", "RUNNING_FEET"]),
  body("variants").isArray({ min: 1 }).withMessage("Add at least one variant."),
  body("variants.*.sku").trim().notEmpty().withMessage("Code is required.").isLength({ max: 40 }),
  body("variants.*.gstPercent").isFloat().toFloat().isIn(GST_RATES).withMessage("Choose a GST rate."),
  body("variants.*.retailPrice").isFloat({ min: 0 }).withMessage("Retail cost is required."),
  ...["purchasePrice", "dealerPrice", "customizedPrice", "openingStock", "minStockLevel"].map((field) => money(`variants.*.${field}`)),
  body("variants.*.discountPercent").optional({ values: "null" }).isFloat({ min: 0, max: 100 }),
];

router.get("/products/variants", catalog.listVariantRows);
router.get("/products/export", catalog.exportProducts);
router.get("/products/next-variant-code", adminOnly, catalog.nextVariantCode);
router.patch(
  "/products/bulk/:kind",
  adminOnly,
  validate(
    param("kind").isIn(["names", "price-code", "gst-hsn"]),
    body("rows").isArray({ min: 1 }).withMessage("Nothing to update."),
    body("rows.*.variantId").isInt({ min: 1 }),
    body("rows.*.sku").optional().trim().notEmpty().withMessage("Code cannot be empty."),
    body("rows.*.gstPercent").optional().isFloat().toFloat().isIn(GST_RATES).withMessage("Choose a GST rate."),
    ...["purchasePrice", "retailPrice", "dealerPrice", "customizedPrice"].map((field) => money(`rows.*.${field}`)),
  ),
  catalog.bulkUpdate,
);
router.get("/products/:id", validate(idParam()), catalog.getProduct);
router.post("/products", adminOnly, validate(...productRules), catalog.createProduct);
router.put("/products/:id", adminOnly, validate(idParam(), ...productRules), catalog.updateProduct);
router.patch("/products/:id/status", adminOnly, validate(idParam(), body("isActive").isBoolean()), catalog.setProductStatus);
router.patch("/variants/:id/status", adminOnly, validate(idParam(), body("isActive").isBoolean()), catalog.setVariantStatus);
router.get("/variants/lookup", catalog.lookupVariants);
router.get("/variants/barcode/:code", catalog.findByBarcode);

// Inventory
router.get("/inventory", catalog.listInventory);
router.get("/inventory/low-stock", catalog.listLowStock);
router.post(
  "/inventory/:variantId/adjust",
  adminOnly,
  validate(
    idParam("variantId"),
    body("type").isIn(["PURCHASE", "ADJUSTMENT"]).withMessage("Choose purchase or adjustment."),
    body("quantity").isFloat().withMessage("Enter a quantity."),
    body("note").optional().isLength({ max: 255 }),
  ),
  catalog.adjustStock,
);
router.get("/inventory/:variantId/movements", validate(idParam("variantId")), catalog.listMovements);

// Customers
const customerRules = [
  body("name").trim().notEmpty().withMessage("Customer name is required.").isLength({ max: 150 }),
  optionalPhone("phone"),
  optionalGstin("gstin"),
  body("stateCode").optional({ values: "falsy" }).matches(/^\d{2}$/),
  body("priceTier").optional().isIn(PRICE_TIERS),
  body("email").optional({ values: "falsy" }).isEmail().withMessage("Enter a valid email."),
];
router.get("/customers", catalog.listCustomers);
router.get("/customers/:id", validate(idParam()), catalog.getCustomer);
router.post("/customers", validate(...customerRules), catalog.createCustomer);
router.put("/customers/:id", validate(idParam(), ...customerRules), catalog.updateCustomer);

// Invoices
const paymentRules = (prefix) => [
  body(`${prefix}.method`).optional().isIn(PAYMENT_METHODS).withMessage("Choose a payment method."),
  money(`${prefix}.amount`),
  money(`${prefix}.amountReceived`),
  body(`${prefix}.transactionRef`).optional({ values: "null" }).isLength({ max: 100 }),
];

router.get("/invoices/next-number", validate(query("channel").isIn(["POS", "SALES_ORDER"]).withMessage("Unknown channel.")), sales.nextInvoiceNumber);
router.get("/invoices/options", sales.listInvoiceOptions);
router.get("/invoices", sales.listInvoices);
router.post(
  "/invoices",
  validate(
    body("channel").isIn(["POS", "SALES_ORDER"]).withMessage("Unknown channel."),
    body("lines").isArray({ min: 1 }).withMessage("Add at least one item."),
    body("lines.*.variantId").isInt({ min: 1 }),
    body("lines.*.pieces").isFloat({ gt: 0 }).withMessage("Quantity must be more than zero."),
    body("lines.*.length").optional({ values: "null" }).isFloat({ gt: 0 }),
    body("lines.*.width").optional({ values: "null" }).isFloat({ gt: 0 }),
    body("lines.*.discountPercent").optional({ values: "null" }).isFloat({ min: 0, max: 100 }).withMessage("Discount must be 0–100%."),
    money("lines.*.unitPrice"),
    body("lines.*.description").optional({ values: "null" }).isLength({ max: 255 }),
    body("billDiscount.type").optional({ values: "null" }).isIn(["PERCENT", "AMOUNT"]),
    money("billDiscount.value"),
    money("freightCharges"),
    body("roundOff").optional().isBoolean(),
    body("customerId").optional({ values: "null" }).isInt({ min: 1 }),
    body("customer.name").optional({ values: "null" }).trim().isLength({ max: 150 }),
    optionalPhone("customer.phone"),
    optionalGstin("customer.gstin"),
    body("customer.stateCode").optional({ values: "falsy" }).matches(/^\d{2}$/),
    body("customer.priceTier").optional({ values: "null" }).isIn(PRICE_TIERS),
    body("invoiceDate").optional({ values: "falsy" }).isISO8601({ strict: true }).withMessage("Invalid date."),
    body("dated").optional({ values: "falsy" }).isISO8601({ strict: true }),
    body("dueDate").optional({ values: "falsy" }).isISO8601({ strict: true }),
    ...paymentRules("payment"),
  ),
  sales.createInvoice,
);
router.get("/invoices/:id", validate(idParam()), sales.getInvoice);
router.post(
  "/invoices/:id/payments",
  validate(idParam(), body("method").isIn(PAYMENT_METHODS), body("amount").isFloat({ gt: 0 }).withMessage("Enter an amount."), money("amountReceived")),
  sales.addPayment,
);
router.post(
  "/invoices/:id/cancel",
  adminOnly,
  validate(idParam(), body("reason").trim().notEmpty().withMessage("Give a reason for cancelling.").isLength({ max: 255 })),
  sales.cancelInvoice,
);
router.post(
  "/invoices/:id/returns",
  validate(
    idParam(),
    body("items").isArray({ min: 1 }).withMessage("Select items to return."),
    body("items.*.invoiceItemId").isInt({ min: 1 }),
    body("items.*.pieces").isFloat({ min: 0 }),
    body("refundMethod").isIn(PAYMENT_METHODS).withMessage("Choose how the refund is paid."),
    body("reason").optional().isLength({ max: 255 }),
  ),
  sales.createReturn,
);
router.get("/returns", sales.listReturns);

// Reports
const rangeRules = ["from", "to"].map((key) =>
  query(key).optional({ values: "falsy" }).isISO8601({ strict: true }).withMessage("Dates must be YYYY-MM-DD."),
);
router.get("/reports/dashboard", sales.dashboard);
router.get("/reports/summary", adminOnly, validate(...rangeRules), sales.summary);
router.get("/reports/sales-trend", adminOnly, validate(...rangeRules), sales.salesTrend);
router.get("/reports/products", adminOnly, validate(...rangeRules), sales.productSales);
router.get("/reports/payment-methods", adminOnly, validate(...rangeRules), sales.paymentSplit);

export default router;
