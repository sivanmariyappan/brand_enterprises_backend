import { Op } from "sequelize";
import ProductVariant from "../models/ProductVariant.js";
import StockMovement from "../models/StockMovement.js";

const round3 = (value) => Math.round(value * 1000) / 1000;

/**
 * Loads and row-locks variants for a stock change. Locks are taken in id
 * order so two concurrent bills touching the same items cannot deadlock.
 */
export async function lockVariants(variantIds, transaction, include = []) {
  const ids = [...new Set(variantIds.map(Number))].sort((a, b) => a - b);
  const variants = await ProductVariant.findAll({
    where: { id: { [Op.in]: ids } },
    include,
    order: [["id", "ASC"]],
    lock: transaction.LOCK.UPDATE,
    transaction,
  });
  return new Map(variants.map((variant) => [variant.id, variant]));
}

/** Applies a signed stock change to a locked variant and records it in the ledger. */
export async function applyStockChange(variant, delta, movement, transaction) {
  const balanceAfter = round3(Number(variant.stockQuantity) + Number(delta));
  await variant.update({ stockQuantity: balanceAfter }, { transaction });
  await StockMovement.create(
    { variantId: variant.id, quantity: round3(delta), balanceAfter, ...movement },
    { transaction },
  );
  return balanceAfter;
}

export function stockStatus(stockQuantity, minStockLevel) {
  if (Number(stockQuantity) <= 0) return "OUT";
  if (Number(stockQuantity) <= Number(minStockLevel)) return "LOW";
  return "IN";
}
