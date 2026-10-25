import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { createHttpError } from "../middleware/errorHandler.js";
import { dayRange, todayIso } from "../utils/dates.js";
import { listLowStock } from "./inventoryService.js";

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const SALE_FILTER = "i.status <> 'CANCELLED' AND i.invoice_date >= :start AND i.invoice_date < :end";

function rangeFrom(query) {
  const from = query.from || todayIso();
  const to = query.to || from;
  if (from > to) throw createHttpError(400, "From date must be on or before To date.");
  const { start, end } = dayRange(from, to);
  return { from, to, start, end };
}

function select(sql, replacements) {
  return sequelize.query(sql, { replacements, type: QueryTypes.SELECT });
}

async function summaryFor(start, end) {
  const replacements = { start, end };
  const [[bills], [items], [returns]] = await Promise.all([
    select(
      `SELECT COUNT(*) AS invoices, COALESCE(SUM(grand_total), 0) AS gross, COALESCE(SUM(discount_total), 0) AS discount,
              COALESCE(SUM(gst_total), 0) AS gst, COALESCE(SUM(taxable_total), 0) AS taxable
       FROM invoices i WHERE ${SALE_FILTER}`,
      replacements,
    ),
    // Profit = taxable value minus cost (Actual Cost snapshot × billed quantity).
    select(
      `SELECT COALESCE(SUM(ii.pieces), 0) AS pieces,
              COALESCE(SUM(ii.taxable_amount - ii.purchase_price * ii.quantity), 0) AS profit
       FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id WHERE ${SALE_FILTER}`,
      replacements,
    ),
    select(
      `SELECT COUNT(DISTINCT r.id) AS count, COALESCE(SUM(ri.refund_amount), 0) AS refunds,
              COALESCE(SUM(ri.gst_amount), 0) AS gst, COALESCE(SUM(ri.pieces), 0) AS pieces,
              COALESCE(SUM(ri.taxable_amount - ii.purchase_price * ii.quantity * ri.pieces / ii.pieces), 0) AS profit
       FROM return_items ri
       JOIN returns r ON r.id = ri.return_id
       JOIN invoice_items ii ON ii.id = ri.invoice_item_id
       WHERE r.created_at >= :start AND r.created_at < :end`,
      replacements,
    ),
  ]);

  const invoices = Number(bills.invoices);
  const netSales = round2(bills.gross - returns.refunds);
  return {
    grossSales: round2(bills.gross),
    refunds: round2(returns.refunds),
    returnsCount: Number(returns.count),
    netSales,
    invoices,
    averageBill: invoices > 0 ? round2(netSales / invoices) : 0,
    productsSold: round2(items.pieces - returns.pieces),
    discountGiven: round2(bills.discount),
    gstCollected: round2(bills.gst - returns.gst),
    taxableValue: round2(bills.taxable),
    profit: round2(items.profit - returns.profit),
  };
}

/** Totals for the range plus the same-length period just before it (for deltas). */
export async function getSummary(query) {
  const { from, to, start, end } = rangeFrom(query);
  const length = end.getTime() - start.getTime();
  const [current, previous] = await Promise.all([
    summaryFor(start, end),
    summaryFor(new Date(start.getTime() - length), start),
  ]);
  return { from, to, ...current, previous };
}

function isoDay(date) {
  return new Date(date.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

export async function getSalesTrend(query) {
  const { start, end } = rangeFrom(query);
  const groupBy = ["day", "week", "month"].includes(query.groupBy) ? query.groupBy : "day";
  const label = {
    day: "DATE(i.invoice_date)",
    week: "DATE_SUB(DATE(i.invoice_date), INTERVAL WEEKDAY(i.invoice_date) DAY)",
    month: "DATE_FORMAT(i.invoice_date, '%Y-%m')",
  }[groupBy];

  const rows = await select(
    `SELECT ${label} AS period, COUNT(*) AS invoices, SUM(i.grand_total) AS sales, SUM(i.gst_total) AS gst
     FROM invoices i WHERE ${SALE_FILTER} GROUP BY period ORDER BY period`,
    { start, end },
  );
  const byPeriod = new Map(
    rows.map((row) => [
      String(row.period instanceof Date ? isoDay(row.period) : row.period),
      { invoices: Number(row.invoices), sales: round2(row.sales), gst: round2(row.gst) },
    ]),
  );

  // Fill empty days so the chart shows gaps as zero instead of skipping them.
  if (groupBy === "day") {
    const points = [];
    for (let time = start.getTime(); time < end.getTime(); time += DAY_MS) {
      const period = isoDay(new Date(time));
      points.push({ period, ...(byPeriod.get(period) || { invoices: 0, sales: 0, gst: 0 }) });
    }
    return { groupBy, points };
  }
  return { groupBy, points: [...byPeriod].map(([period, values]) => ({ period, ...values })) };
}

export async function getProductSales(query) {
  const { start, end } = rangeFrom(query);
  const slow = query.sort === "slow";
  const byProduct = query.groupBy === "product";
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 200);

  // Net of returns: each line counts only its unreturned share.
  const sales = `SELECT ii.variant_id,
      SUM(ii.pieces - ii.returned_quantity) AS qty,
      SUM(ii.final_amount * (ii.pieces - ii.returned_quantity) / ii.pieces) AS sales,
      SUM((ii.taxable_amount - ii.purchase_price * ii.quantity) * (ii.pieces - ii.returned_quantity) / ii.pieces) AS profit
    FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
    WHERE ${SALE_FILTER} GROUP BY ii.variant_id`;

  const fields = byProduct
    ? `p.id AS id, p.name AS productName, NULL AS variantName, p.code AS code,
       COALESCE(SUM(s.qty), 0) AS qty, COALESCE(SUM(s.sales), 0) AS sales, COALESCE(SUM(s.profit), 0) AS profit`
    : `v.id AS id, p.name AS productName, v.name AS variantName, v.sku AS code,
       COALESCE(s.qty, 0) AS qty, COALESCE(s.sales, 0) AS sales, COALESCE(s.profit, 0) AS profit`;

  const rows = await select(
    `SELECT ${fields}
     FROM product_variants v JOIN products p ON p.id = v.product_id
     LEFT JOIN (${sales}) s ON s.variant_id = v.id
     WHERE ${slow ? "v.is_active = 1 AND p.is_active = 1" : "s.qty > 0"}
     ${byProduct ? "GROUP BY p.id, p.name, p.code" : ""}
     ORDER BY qty ${slow ? "ASC" : "DESC"}, sales ${slow ? "ASC" : "DESC"}, productName ASC
     LIMIT :limit`,
    { start, end, limit },
  );
  return rows.map((row) => ({ ...row, qty: round2(row.qty), sales: round2(row.sales), profit: round2(row.profit) }));
}

export async function getPaymentSplit(query) {
  const { start, end } = rangeFrom(query);
  const rows = await select(
    `SELECT pm.method, COUNT(*) AS count, SUM(pm.amount) AS amount
     FROM payments pm JOIN invoices i ON i.id = pm.invoice_id
     WHERE i.status <> 'CANCELLED' AND pm.created_at >= :start AND pm.created_at < :end
     GROUP BY pm.method ORDER BY amount DESC`,
    { start, end },
  );
  return rows.map((row) => ({ method: row.method, count: Number(row.count), amount: round2(row.amount) }));
}

/** Home screen: today's numbers, a 7-day trend and stock alerts. Profit only for admins. */
export async function getDashboard(role) {
  const today = todayIso();
  const weekAgo = isoDay(new Date(new Date(`${today}T00:00:00+05:30`).getTime() - 6 * DAY_MS));
  const [summary, trend, lowStock, recent] = await Promise.all([
    getSummary({ from: today, to: today }),
    getSalesTrend({ from: weekAgo, to: today, groupBy: "day" }),
    listLowStock(8),
    select(
      `SELECT id, invoice_number AS invoiceNumber, invoice_date AS invoiceDate, customer_name AS customerName,
              grand_total AS grandTotal, status, payment_status AS paymentStatus, channel
       FROM invoices ORDER BY id DESC LIMIT 6`,
      {},
    ),
  ]);
  const [{ lowCount }] = await select(
    `SELECT COUNT(*) AS lowCount FROM product_variants v JOIN products p ON p.id = v.product_id
     WHERE v.is_active = 1 AND p.is_active = 1 AND v.stock_quantity <= v.min_stock_level`,
    {},
  );

  if (role !== "ADMIN") {
    delete summary.profit;
    delete summary.previous.profit;
  }
  return { today: summary, trend: trend.points, lowStock, lowStockCount: Number(lowCount), recentInvoices: recent };
}
