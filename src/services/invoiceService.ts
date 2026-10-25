import { Op, literal } from "sequelize";
import { calculateBill, calculateChange, resolveTaxType, toPaise } from "../../../shared/billing.js";
import { sequelize } from "../config/database.js";
import { createHttpError } from "../middleware/errorHandler.js";
import {
  Customer,
  Invoice,
  InvoiceItem,
  Payment,
  ReturnItem,
  SalesReturn,
  User,
} from "../models/index.js";
import { CHANNELS, INVOICE_STATUS, PAYMENT_STATUS } from "../models/Invoice.js";
import { PAYMENT_METHODS } from "../models/Payment.js";
import { MOVEMENT_TYPES } from "../models/StockMovement.js";
import { dayRange, todayIso } from "../utils/dates.js";
import { pagedResult, parsePagination } from "../utils/pagination.js";
import { createCustomer, findCustomerByPhone, getCustomer } from "./customerService.js";
import { nextNumber, peekNumber } from "./numberingService.js";
import { variantInclude } from "./productService.js";
import { getSettings } from "./settingsService.js";
import { applyStockChange, lockVariants } from "./stockService.js";

const TIER_PRICE_FIELD = { RETAIL: "retailPrice", DEALER: "dealerPrice", CUSTOMIZED: "customizedPrice" };

function paymentStatusFor(amountPaid, grandTotal) {
  if (toPaise(amountPaid) >= toPaise(grandTotal)) return PAYMENT_STATUS.PAID;
  return toPaise(amountPaid) > 0 ? PAYMENT_STATUS.PARTIAL : PAYMENT_STATUS.UNPAID;
}

/**
 * POS: optional walk-in customer, found or created by phone.
 * Sales order: an existing customer, or a new one when "New Customer" is ticked.
 */
async function resolveCustomer(input, isPos, transaction) {
  const details = input.customer || {};

  if (isPos) {
    if (!details.phone) return { record: null, snapshot: { name: details.name || null, phone: null } };
    let record = await findCustomerByPhone(details.phone, transaction);
    if (!record) record = await createCustomer({ name: details.name || "Walk-in customer", phone: details.phone }, transaction);
    return { record, snapshot: { name: details.name || record.name, phone: record.phone } };
  }

  let record;
  if (input.customerId && !details.isNew) {
    record = await getCustomer(input.customerId, transaction);
  } else {
    if (!details.name) throw createHttpError(400, "Customer name is required.", [{ field: "customer.name", message: "Required." }]);
    if (details.phone && (await findCustomerByPhone(details.phone, transaction))) {
      throw createHttpError(409, "A customer with this phone number already exists. Select them instead.", [
        { field: "customer.phone", message: "Phone number already used." },
      ]);
    }
    record = await createCustomer(
      {
        name: details.name,
        phone: details.phone,
        gstin: details.gstin,
        stateCode: details.stateCode,
        priceTier: details.priceTier,
        billingAddress: details.billingAddress,
        deliveryAddress: input.deliveryAddress,
      },
      transaction,
    );
  }

  return {
    record,
    snapshot: {
      name: details.name || record.name,
      phone: details.phone || record.phone,
      gstin: details.gstin ?? record.gstin,
      stateCode: details.stateCode ?? record.stateCode,
      billingAddress: details.billingAddress ?? record.billingAddress,
      deliveryAddress: input.deliveryAddress || record.deliveryAddress || details.billingAddress || record.billingAddress,
    },
  };
}

function resolvePayment(payment, grandTotal, isPos) {
  if (!payment || !payment.method) {
    if (isPos) throw createHttpError(400, "Payment is required.");
    return null;
  }
  if (!Object.values(PAYMENT_METHODS).includes(payment.method)) {
    throw createHttpError(400, "Unknown payment method.");
  }

  const amount = isPos ? grandTotal : Math.min(Number(payment.amount ?? grandTotal), grandTotal);
  if (!isPos && !(amount > 0)) return null;

  if (payment.method === PAYMENT_METHODS.CASH) {
    const amountReceived = Number(payment.amountReceived ?? amount);
    const changeAmount = calculateChange(amount, amountReceived);
    if (changeAmount < 0) {
      throw createHttpError(400, "Cash received is less than the amount due.", [{ field: "amountReceived", message: "Too low." }]);
    }
    return { method: payment.method, amount, amountReceived, changeAmount, transactionRef: null };
  }
  return { method: payment.method, amount, amountReceived: amount, changeAmount: 0, transactionRef: payment.transactionRef || null };
}

/** Sales-order date from the form; today keeps the current time. */
function resolveInvoiceDate(date) {
  if (!date || date === todayIso()) return new Date();
  return new Date(`${date}T12:00:00+05:30`);
}

function buildLines(lines, variants, priceTier, isPos) {
  return lines.map((line, row) => {
    const variant = variants.get(Number(line.variantId));
    if (!variant || !variant.isActive || !variant.product?.isActive) {
      throw createHttpError(400, "A product in the bill is no longer available.", [{ row, message: "Not available." }]);
    }
    const tierPrice = Number(variant[TIER_PRICE_FIELD[priceTier]]);
    const requested = line.unitPrice === undefined || line.unitPrice === null || line.unitPrice === "" ? null : Number(line.unitPrice);
    const priceOverridden = !isPos && requested !== null && toPaise(requested) !== toPaise(tierPrice);

    return {
      variant,
      row,
      unitPrice: priceOverridden ? requested : tierPrice,
      priceOverridden,
      pricingMethod: variant.product.pricingMethod,
      pieces: Number(line.pieces),
      length: line.length ? Number(line.length) : null,
      width: line.width ? Number(line.width) : null,
      discountPercent: line.discountPercent ?? variant.discountPercent,
      gstPercent: variant.gstPercent,
      description: line.description || null,
    };
  });
}

function assertStock(lines) {
  const needed = new Map();
  for (const line of lines) needed.set(line.variant.id, (needed.get(line.variant.id) || 0) + line.pieces);

  const shortages = [];
  for (const [variantId, pieces] of needed) {
    const line = lines.find((candidate) => candidate.variant.id === variantId);
    if (pieces > Number(line.variant.stockQuantity)) {
      shortages.push({
        row: line.row,
        variantId,
        message: `${line.variant.product.name} ${line.variant.name}: only ${line.variant.stockQuantity} in stock.`,
        available: line.variant.stockQuantity,
        requested: pieces,
      });
    }
  }
  if (shortages.length > 0) throw createHttpError(409, "Not enough stock for some items.", shortages);
}

export async function createInvoice(input, user) {
  const isPos = input.channel === CHANNELS.POS;

  const invoiceId = await sequelize.transaction(async (transaction) => {
    const settings = await getSettings(transaction);
    const { record: customer, snapshot } = await resolveCustomer(input, isPos, transaction);
    const priceTier = customer?.priceTier || "RETAIL";
    const taxType = isPos ? "INTRA" : resolveTaxType(settings.shopStateCode, snapshot.stateCode);

    if (input.salesRepId && !(await User.findByPk(input.salesRepId, { transaction }))) {
      throw createHttpError(400, "Sales rep not found.");
    }

    const variants = await lockVariants(input.lines.map((line) => line.variantId), transaction, variantInclude);
    const lines = buildLines(input.lines, variants, priceTier, isPos);
    assertStock(lines);

    const billDiscount = input.billDiscount?.type ? input.billDiscount : null;
    const { lines: calculated, totals } = calculateBill(lines, {
      billDiscount,
      taxType,
      freightCharges: isPos ? 0 : input.freightCharges,
      roundOff: input.roundOff ?? true,
    });

    const payment = resolvePayment(input.payment, totals.grandTotal, isPos);
    const invoiceDate = isPos ? new Date() : resolveInvoiceDate(input.invoiceDate);
    const invoiceNumber = await nextNumber(input.channel, transaction, invoiceDate);
    const amountPaid = payment?.amount || 0;

    const invoice = await Invoice.create(
      {
        channel: input.channel,
        invoiceNumber,
        invoiceDate,
        dated: input.dated || null,
        dueDate: isPos ? null : input.dueDate || todayIso(),
        cashierId: user.sub,
        salesRepId: input.salesRepId || null,
        customerId: customer?.id || null,
        customerName: snapshot.name,
        customerPhone: snapshot.phone,
        customerGstin: snapshot.gstin || null,
        placeOfSupplyStateCode: isPos ? settings.shopStateCode : snapshot.stateCode || settings.shopStateCode,
        billingAddress: snapshot.billingAddress || null,
        deliveryAddress: snapshot.deliveryAddress || null,
        buyerRef: input.buyerRef || null,
        paymentTerms: input.paymentTerms || null,
        summary: input.summary || null,
        deliveryMode: input.deliveryMode || null,
        customerNotes: input.customerNotes || null,
        privateNotes: input.privateNotes || null,
        taxType,
        billDiscountType: billDiscount?.type || null,
        billDiscountValue: billDiscount ? Number(billDiscount.value) : 0,
        ...totals,
        amountPaid,
        paymentStatus: paymentStatusFor(amountPaid, totals.grandTotal),
        status: INVOICE_STATUS.COMPLETED,
      },
      { transaction },
    );

    await InvoiceItem.bulkCreate(
      lines.map((line, index) => ({
        invoiceId: invoice.id,
        variantId: line.variant.id,
        description: line.description,
        productName: line.variant.product.name,
        variantName: line.variant.name,
        sku: line.variant.sku,
        hsnCode: line.variant.hsnCode || line.variant.product.hsnCode,
        size: line.variant.size?.name || null,
        color: line.variant.color?.name || null,
        unit: line.variant.product.unit?.name || null,
        pricingMethod: line.pricingMethod,
        priceTier,
        unitPrice: line.unitPrice,
        priceOverridden: line.priceOverridden,
        purchasePrice: line.variant.purchasePrice,
        discountPercent: line.discountPercent,
        gstPercent: line.gstPercent,
        pieces: line.pieces,
        length: line.length,
        width: line.width,
        ...calculated[index],
      })),
      { transaction },
    );

    if (payment) {
      await Payment.create({ ...payment, invoiceId: invoice.id, receivedBy: user.sub }, { transaction });
    }

    for (const line of lines) {
      await applyStockChange(
        line.variant,
        -line.pieces,
        { type: MOVEMENT_TYPES.SALE, referenceType: "INVOICE", referenceId: invoice.id, note: invoiceNumber, userId: user.sub },
        transaction,
      );
    }

    return invoice.id;
  });

  return getInvoice(invoiceId);
}

export async function getInvoice(id) {
  const invoice = await Invoice.findByPk(id, {
    include: [
      { model: InvoiceItem, as: "items" },
      { model: Payment, as: "payments" },
      { model: SalesReturn, as: "returns", include: [{ model: ReturnItem, as: "items" }] },
      { model: User, as: "cashier", attributes: ["id", "name"] },
      { model: User, as: "salesRep", attributes: ["id", "name"] },
      { model: Customer, as: "customer", attributes: ["id", "name", "priceTier"] },
    ],
    order: [
      [{ model: InvoiceItem, as: "items" }, "id", "ASC"],
      [{ model: Payment, as: "payments" }, "id", "ASC"],
    ],
  });
  if (!invoice) throw createHttpError(404, "Invoice not found.");

  const settings = await getSettings();
  const json = invoice.toJSON();
  json.amountDue = Math.max(0, (toPaise(invoice.grandTotal) - toPaise(invoice.amountPaid)) / 100);
  json.shop = settings.toJSON();
  return json;
}

const LIST_SORTS = {
  number: [["id"]],
  date: [["invoiceDate"], ["id"]],
  customer: [["customerName"]],
  total: [["grandTotal"]],
  status: [["status"], ["paymentStatus"]],
};

function listWhere(query) {
  const where = {};
  if (query.channel) where.channel = query.channel;
  if (query.customerId) where.customerId = query.customerId;

  const { start, end } = dayRange(query.from, query.to);
  if (start || end) {
    where.invoiceDate = { ...(start && { [Op.gte]: start }), ...(end && { [Op.lt]: end }) };
  }

  if (Object.values(PAYMENT_STATUS).includes(query.status)) {
    where.paymentStatus = query.status;
    where.status = { [Op.ne]: INVOICE_STATUS.CANCELLED };
  } else if (Object.values(INVOICE_STATUS).includes(query.status)) {
    where.status = query.status;
  }

  if (query.method && Object.values(PAYMENT_METHODS).includes(query.method)) {
    where.id = { [Op.in]: literal(`(SELECT invoice_id FROM payments WHERE method = ${sequelize.escape(query.method)})`) };
  }

  if (query.search) {
    const term = `%${query.search.trim()}%`;
    where[Op.or] = [
      { invoiceNumber: { [Op.like]: term } },
      { customerName: { [Op.like]: term } },
      { customerPhone: { [Op.like]: term } },
    ];
  }
  return where;
}

export async function listInvoices(query) {
  const paging = parsePagination(query);
  const direction = String(query.order).toLowerCase() === "asc" ? "ASC" : "DESC";
  const sort = LIST_SORTS[query.sort] || LIST_SORTS.date;

  const { rows, count } = await Invoice.findAndCountAll({
    where: listWhere(query),
    attributes: {
      include: [
        [literal("(SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = `Invoice`.`id`)"), "itemCount"],
        [literal("(SELECT GROUP_CONCAT(DISTINCT p.method) FROM payments p WHERE p.invoice_id = `Invoice`.`id`)"), "paymentMethods"],
      ],
    },
    include: [
      { model: User, as: "cashier", attributes: ["id", "name"] },
      { model: User, as: "salesRep", attributes: ["id", "name"] },
    ],
    order: sort.map((path) => [...path, direction]),
    limit: paging.limit,
    offset: paging.offset,
  });

  const data = rows.map((invoice) => ({
    id: invoice.id,
    channel: invoice.channel,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    dueDate: invoice.dueDate,
    customerId: invoice.customerId,
    customerName: invoice.customerName,
    customerPhone: invoice.customerPhone,
    salesPerson: invoice.salesRep?.name || invoice.cashier?.name || null,
    cashier: invoice.cashier?.name || null,
    itemCount: Number(invoice.get("itemCount")),
    paymentMethods: invoice.get("paymentMethods") ? invoice.get("paymentMethods").split(",") : [],
    subtotal: invoice.subtotal,
    discountTotal: invoice.discountTotal,
    gstTotal: invoice.gstTotal,
    grandTotal: invoice.grandTotal,
    amountPaid: invoice.amountPaid,
    refundedTotal: invoice.refundedTotal,
    paymentStatus: invoice.paymentStatus,
    status: invoice.status,
  }));
  return pagedResult(data, count, paging);
}

/** Id + number pairs for the "Sales Order" quick-lookup dropdown. */
export async function listInvoiceOptions({ channel, customerId }) {
  const where = {};
  if (channel) where.channel = channel;
  if (customerId) where.customerId = customerId;
  const invoices = await Invoice.findAll({
    where,
    attributes: ["id", "invoiceNumber", "customerName"],
    order: [["id", "DESC"]],
    limit: 200,
  });
  return invoices.map((invoice) => invoice.toJSON());
}

export async function previewNextNumber(channel) {
  return { invoiceNumber: await peekNumber(channel) };
}

/** Records a payment against an unpaid / partially paid invoice. */
export async function addPayment(id, input, user) {
  await sequelize.transaction(async (transaction) => {
    const invoice = await Invoice.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!invoice) throw createHttpError(404, "Invoice not found.");
    if (invoice.status === INVOICE_STATUS.CANCELLED) throw createHttpError(400, "This invoice is cancelled.");

    const due = (toPaise(invoice.grandTotal) - toPaise(invoice.amountPaid)) / 100;
    if (due <= 0) throw createHttpError(400, "This invoice is already fully paid.");
    if (Number(input.amount) > due) {
      throw createHttpError(400, `Amount is more than the ₹${due.toFixed(2)} due.`, [{ field: "amount", message: "Too high." }]);
    }

    const payment = resolvePayment({ ...input, amount: Number(input.amount) }, due, false);
    if (!payment) throw createHttpError(400, "Amount must be greater than zero.");
    await Payment.create({ ...payment, invoiceId: invoice.id, receivedBy: user.sub }, { transaction });

    const amountPaid = (toPaise(invoice.amountPaid) + toPaise(payment.amount)) / 100;
    await invoice.update({ amountPaid, paymentStatus: paymentStatusFor(amountPaid, invoice.grandTotal) }, { transaction });
  });
  return getInvoice(id);
}

/** Cancels a whole invoice and puts every item back into stock. */
export async function cancelInvoice(id, reason, user) {
  await sequelize.transaction(async (transaction) => {
    const invoice = await Invoice.findByPk(id, {
      include: [{ model: InvoiceItem, as: "items" }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!invoice) throw createHttpError(404, "Invoice not found.");
    if (invoice.status === INVOICE_STATUS.CANCELLED) throw createHttpError(400, "This invoice is already cancelled.");
    if (invoice.status !== INVOICE_STATUS.COMPLETED) {
      throw createHttpError(400, "Invoices with returns cannot be cancelled. Return the remaining items instead.");
    }

    const variants = await lockVariants(invoice.items.map((item) => item.variantId), transaction);
    for (const item of invoice.items) {
      const variant = variants.get(item.variantId);
      if (!variant) continue;
      await applyStockChange(
        variant,
        Number(item.pieces),
        { type: MOVEMENT_TYPES.CANCEL, referenceType: "INVOICE", referenceId: invoice.id, note: `Cancelled ${invoice.invoiceNumber}`, userId: user.sub },
        transaction,
      );
    }

    await invoice.update(
      { status: INVOICE_STATUS.CANCELLED, cancelReason: reason, cancelledBy: user.sub, cancelledAt: new Date() },
      { transaction },
    );
  });
  return getInvoice(id);
}
