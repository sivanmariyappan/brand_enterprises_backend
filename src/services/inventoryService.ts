import { QueryTypes } from "sequelize";
import { sequelize } from "../config/database.js";
import { createHttpError } from "../middleware/errorHandler.js";
import { StockMovement, User } from "../models/index.js";
import { MOVEMENT_TYPES } from "../models/StockMovement.js";
import { pagedResult, parsePagination, parseSort } from "../utils/pagination.js";
import { applyStockChange, lockVariants } from "./stockService.js";

const STATUS_SQL = `CASE WHEN v.stock_quantity <= 0 THEN 'OUT'
  WHEN v.stock_quantity <= v.min_stock_level THEN 'LOW' ELSE 'IN' END`;

// Units sold = billed pieces minus returned pieces, ignoring cancelled bills.
const SOLD_SQL = `SELECT ii.variant_id, SUM(ii.pieces - ii.returned_quantity) AS sold
  FROM invoice_items ii JOIN invoices i ON i.id = ii.invoice_id
  WHERE i.status <> 'CANCELLED' GROUP BY ii.variant_id`;

const FROM_SQL = `FROM product_variants v
  JOIN products p ON p.id = v.product_id
  LEFT JOIN masters u ON u.id = p.unit_id
  LEFT JOIN (${SOLD_SQL}) s ON s.variant_id = v.id`;

const SORTS = {
  product: "p.name",
  code: "v.sku",
  stock: "v.stock_quantity",
  sold: "sold_quantity",
  value: "stock_value",
  status: "FIELD(stock_status, 'OUT', 'LOW', 'IN')",
};

function buildFilters(query) {
  const conditions = ["v.is_active = 1", "p.is_active = 1"];
  const replacements = {};
  if (query.search) {
    conditions.push("(p.name LIKE :search OR v.name LIKE :search OR v.sku LIKE :search OR v.barcode LIKE :search)");
    replacements.search = `%${query.search.trim()}%`;
  }
  if (["IN", "LOW", "OUT"].includes(query.status)) {
    conditions.push(`${STATUS_SQL} = :status`);
    replacements.status = query.status;
  }
  return { where: `WHERE ${conditions.join(" AND ")}`, replacements };
}

export async function listInventory(query) {
  const paging = parsePagination(query);
  const sort = parseSort(query, SORTS, "product");
  const direction = query.order ? sort.direction : "ASC";
  const { where, replacements } = buildFilters(query);

  const rows = await sequelize.query(
    `SELECT v.id, v.sku, v.barcode, v.name AS variantName, p.id AS productId, p.name AS productName,
            u.name AS unit, v.stock_quantity AS stockQuantity, v.min_stock_level AS minStockLevel,
            v.purchase_price AS purchasePrice, v.retail_price AS retailPrice,
            COALESCE(s.sold, 0) AS sold_quantity,
            ROUND(v.stock_quantity * v.purchase_price, 2) AS stock_value,
            ${STATUS_SQL} AS stock_status
     ${FROM_SQL} ${where}
     ORDER BY ${sort.expression} ${direction}, v.id ASC
     LIMIT :limit OFFSET :offset`,
    { replacements: { ...replacements, limit: paging.limit, offset: paging.offset }, type: QueryTypes.SELECT },
  );

  const [summary] = await sequelize.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(ROUND(v.stock_quantity * v.purchase_price, 2)), 0) AS stockValue,
            SUM(${STATUS_SQL} = 'IN') AS inStock,
            SUM(${STATUS_SQL} = 'LOW') AS lowStock,
            SUM(${STATUS_SQL} = 'OUT') AS outOfStock
     ${FROM_SQL} ${where}`,
    { replacements, type: QueryTypes.SELECT },
  );

  const data = rows.map(({ sold_quantity, stock_value, stock_status, ...row }) => ({
    ...row,
    soldQuantity: Number(sold_quantity),
    stockValue: Number(stock_value),
    stockStatus: stock_status,
  }));

  return {
    ...pagedResult(data, Number(summary.total), paging),
    summary: {
      stockValue: Number(summary.stockValue),
      inStock: Number(summary.inStock || 0),
      lowStock: Number(summary.lowStock || 0),
      outOfStock: Number(summary.outOfStock || 0),
    },
  };
}

export async function listLowStock(limit = 50) {
  return sequelize.query(
    `SELECT v.id, v.sku, v.name AS variantName, p.name AS productName, u.name AS unit,
            v.stock_quantity AS stockQuantity, v.min_stock_level AS minStockLevel, ${STATUS_SQL} AS stockStatus
     FROM product_variants v JOIN products p ON p.id = v.product_id LEFT JOIN masters u ON u.id = p.unit_id
     WHERE v.is_active = 1 AND p.is_active = 1 AND v.stock_quantity <= v.min_stock_level
     ORDER BY v.stock_quantity <= 0 DESC, v.stock_quantity / NULLIF(v.min_stock_level, 0) ASC, p.name ASC
     LIMIT :limit`,
    { replacements: { limit: Number(limit) }, type: QueryTypes.SELECT },
  );
}

/**
 * PURCHASE adds stock (quantity > 0). ADJUSTMENT applies a signed correction
 * (e.g. -2 for damaged goods) and may not take stock below zero.
 */
export async function adjustStock(variantId, { type, quantity, note }, userId) {
  const delta = Number(quantity);
  if (type === MOVEMENT_TYPES.PURCHASE && delta <= 0) {
    throw createHttpError(400, "Purchased quantity must be greater than zero.");
  }
  if (delta === 0) throw createHttpError(400, "Quantity cannot be zero.");

  return sequelize.transaction(async (transaction) => {
    const variants = await lockVariants([variantId], transaction);
    const variant = variants.get(Number(variantId));
    if (!variant) throw createHttpError(404, "Product not found.");
    if (Number(variant.stockQuantity) + delta < 0) {
      throw createHttpError(409, `Only ${variant.stockQuantity} in stock; cannot remove ${Math.abs(delta)}.`);
    }
    const balance = await applyStockChange(
      variant,
      delta,
      { type, referenceType: "ADJUSTMENT", note: note || null, userId },
      transaction,
    );
    return { variantId: variant.id, stockQuantity: balance };
  });
}

export async function listMovements(variantId, query) {
  const paging = parsePagination(query, 20);
  const { rows, count } = await StockMovement.findAndCountAll({
    where: { variantId },
    include: [{ model: User, as: "user", attributes: ["id", "name"] }],
    order: [["createdAt", "DESC"], ["id", "DESC"]],
    limit: paging.limit,
    offset: paging.offset,
  });
  return pagedResult(
    rows.map((movement) => ({
      id: movement.id,
      type: movement.type,
      quantity: movement.quantity,
      balanceAfter: movement.balanceAfter,
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
      note: movement.note,
      user: movement.user?.name || null,
      createdAt: movement.createdAt,
    })),
    count,
    paging,
  );
}
