import { Op } from "sequelize";
import { calculateRefund, toPaise } from "../../../shared/billing.js";
import { sequelize } from "../config/database.js";
import { createHttpError } from "../middleware/errorHandler.js";
import { Invoice, InvoiceItem, ReturnItem, SalesReturn, User } from "../models/index.js";
import { INVOICE_STATUS } from "../models/Invoice.js";
import { MOVEMENT_TYPES } from "../models/StockMovement.js";
import { dayRange } from "../utils/dates.js";
import { pagedResult, parsePagination } from "../utils/pagination.js";
import { getInvoice } from "./invoiceService.js";
import { nextNumber } from "./numberingService.js";
import { applyStockChange, lockVariants } from "./stockService.js";

const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * Returns some pieces of an invoice: refunds pro-rata of the billed amounts,
 * puts the pieces back into stock and keeps the original invoice as the
 * reference. The invoice itself is never modified apart from its status.
 */
export async function createReturn(invoiceId, { items, reason, refundMethod }, user) {
  await sequelize.transaction(async (transaction) => {
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [{ model: InvoiceItem, as: "items" }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!invoice) throw createHttpError(404, "Invoice not found.");
    if ([INVOICE_STATUS.CANCELLED, INVOICE_STATUS.RETURNED].includes(invoice.status)) {
      throw createHttpError(400, "Nothing left to return on this invoice.");
    }

    const itemsById = new Map(invoice.items.map((item) => [item.id, item]));
    const requested = items.filter((entry) => Number(entry.pieces) > 0);
    if (requested.length === 0) throw createHttpError(400, "Select at least one item to return.");

    const errors = [];
    for (const [row, entry] of requested.entries()) {
      const item = itemsById.get(Number(entry.invoiceItemId));
      if (!item) {
        errors.push({ row, message: "Item is not on this invoice." });
        continue;
      }
      const remaining = round3(Number(item.pieces) - Number(item.returnedQuantity));
      if (Number(entry.pieces) > remaining) {
        errors.push({ row, invoiceItemId: item.id, message: `Only ${remaining} of ${item.productName} can be returned.` });
      }
    }
    if (errors.length > 0) throw createHttpError(400, "Some return quantities are not valid.", errors);

    const returnNumber = await nextNumber("RETURN", transaction);
    const salesReturn = await SalesReturn.create(
      { returnNumber, invoiceId: invoice.id, reason: reason || null, refundMethod, refundAmount: 0, processedBy: user.sub },
      { transaction },
    );

    const variants = await lockVariants(requested.map((entry) => itemsById.get(Number(entry.invoiceItemId)).variantId), transaction);
    let refundPaise = 0;

    for (const entry of requested) {
      const item = itemsById.get(Number(entry.invoiceItemId));
      const pieces = Number(entry.pieces);
      const refund = calculateRefund(item, pieces, Number(item.returnedQuantity));
      refundPaise += toPaise(refund.refundAmount);

      await ReturnItem.create(
        {
          returnId: salesReturn.id,
          invoiceItemId: item.id,
          variantId: item.variantId,
          pieces,
          taxableAmount: refund.taxableAmount,
          gstAmount: refund.gstAmount,
          refundAmount: refund.refundAmount,
        },
        { transaction },
      );
      await item.update({ returnedQuantity: round3(Number(item.returnedQuantity) + pieces) }, { transaction });

      const variant = variants.get(item.variantId);
      if (variant) {
        await applyStockChange(
          variant,
          pieces,
          { type: MOVEMENT_TYPES.RETURN, referenceType: "RETURN", referenceId: salesReturn.id, note: `${returnNumber} for ${invoice.invoiceNumber}`, userId: user.sub },
          transaction,
        );
      }
    }

    await salesReturn.update({ refundAmount: refundPaise / 100 }, { transaction });

    const fullyReturned = invoice.items.every((item) => Number(item.returnedQuantity) >= Number(item.pieces));
    await invoice.update(
      {
        refundedTotal: (toPaise(invoice.refundedTotal) + refundPaise) / 100,
        status: fullyReturned ? INVOICE_STATUS.RETURNED : INVOICE_STATUS.PARTIALLY_RETURNED,
      },
      { transaction },
    );
  });

  return getInvoice(invoiceId);
}

export async function listReturns(query) {
  const paging = parsePagination(query);
  const where = {};
  const { start, end } = dayRange(query.from, query.to);
  if (start || end) where.createdAt = { ...(start && { [Op.gte]: start }), ...(end && { [Op.lt]: end }) };
  if (query.search) where.returnNumber = { [Op.like]: `%${query.search.trim()}%` };

  const { rows, count } = await SalesReturn.findAndCountAll({
    where,
    include: [
      { model: Invoice, as: "invoice", attributes: ["id", "invoiceNumber", "customerName", "channel"] },
      { model: User, as: "processor", attributes: ["id", "name"] },
      { model: ReturnItem, as: "items", attributes: ["id", "pieces"] },
    ],
    order: [["createdAt", "DESC"]],
    limit: paging.limit,
    offset: paging.offset,
    distinct: true,
  });

  return pagedResult(
    rows.map((entry) => ({
      id: entry.id,
      returnNumber: entry.returnNumber,
      createdAt: entry.createdAt,
      invoiceId: entry.invoiceId,
      invoiceNumber: entry.invoice?.invoiceNumber,
      channel: entry.invoice?.channel,
      customerName: entry.invoice?.customerName,
      refundAmount: entry.refundAmount,
      refundMethod: entry.refundMethod,
      reason: entry.reason,
      pieces: entry.items.reduce((sum, item) => sum + Number(item.pieces), 0),
      processedBy: entry.processor?.name || null,
    })),
    count,
    paging,
  );
}
