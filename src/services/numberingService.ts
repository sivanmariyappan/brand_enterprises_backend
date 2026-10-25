import { sequelize } from "../config/database.js";
import InvoiceCounter from "../models/InvoiceCounter.js";
import { financialYearStart, yearMonth } from "../utils/dates.js";

// POS invoices:   INV-202609-00042   (restarts monthly)
// Sales orders:   SO-26/1            (restarts each financial year)
// Returns:        RET-202609-0003
const SERIES = {
  POS: (date) => ({ series: `INV-${yearMonth(date)}`, format: (n) => `INV-${yearMonth(date)}-${String(n).padStart(5, "0")}` }),
  SALES_ORDER: (date) => {
    const fy = String(financialYearStart(date)).slice(-2);
    return { series: `SO-${fy}`, format: (n) => `SO-${fy}/${n}` };
  },
  RETURN: (date) => ({ series: `RET-${yearMonth(date)}`, format: (n) => `RET-${yearMonth(date)}-${String(n).padStart(4, "0")}` }),
};

/**
 * Issues the next number in a series. Must run inside the caller's
 * transaction: the upsert row-locks the counter until commit, so concurrent
 * checkouts get consecutive numbers without gaps or duplicates.
 */
export async function nextNumber(kind, transaction, date = new Date()) {
  const { series, format } = SERIES[kind](date);
  await sequelize.query(
    `INSERT INTO invoice_counters (series, last_number, created_at, updated_at)
     VALUES (:series, 1, NOW(), NOW())
     ON DUPLICATE KEY UPDATE last_number = last_number + 1, updated_at = NOW()`,
    { replacements: { series }, transaction },
  );
  const counter = await InvoiceCounter.findByPk(series, { transaction, lock: transaction.LOCK.UPDATE });
  return format(counter.lastNumber);
}

/** Preview of the next number (not reserved). */
export async function peekNumber(kind, date = new Date()) {
  const { series, format } = SERIES[kind](date);
  const counter = await InvoiceCounter.findByPk(series);
  return format((counter?.lastNumber || 0) + 1);
}
