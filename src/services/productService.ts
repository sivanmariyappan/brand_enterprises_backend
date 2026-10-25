import ExcelJS from "exceljs";
import { Op } from "sequelize";
import { sequelize } from "../config/database.js";
import { createHttpError } from "../middleware/errorHandler.js";
import { InvoiceItem, Master, Product, ProductVariant, StockMovement } from "../models/index.js";
import { MOVEMENT_TYPES } from "../models/StockMovement.js";
import { pagedResult, parsePagination } from "../utils/pagination.js";
import { stockStatus } from "./stockService.js";

const masterAttributes = ["id", "name"];

const productInclude = [
  { model: Master, as: "category", attributes: masterAttributes },
  { model: Master, as: "brand", attributes: masterAttributes },
  { model: Master, as: "pvcType", attributes: masterAttributes },
  { model: Master, as: "valueAdded", attributes: masterAttributes },
  { model: Master, as: "unit", attributes: masterAttributes },
];

export const variantInclude = [
  { model: Product, as: "product", include: productInclude },
  { model: Master, as: "size", attributes: masterAttributes },
  { model: Master, as: "color", attributes: masterAttributes },
];

const VARIANT_FIELDS = [
  "sku",
  "barcode",
  "sizeId",
  "colorId",
  "name",
  "hsnCode",
  "purchasePrice",
  "retailPrice",
  "dealerPrice",
  "customizedPrice",
  "discountPercent",
  "gstPercent",
  "minStockLevel",
  "isActive",
];

const PRODUCT_FIELDS = [
  "code",
  "name",
  "categoryId",
  "brandId",
  "pvcTypeId",
  "valueAddedId",
  "unitId",
  "pricingMethod",
  "hsnCode",
  "description",
  "isActive",
];

function pick(source, fields) {
  return Object.fromEntries(fields.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function emptyToNull(value) {
  return value === "" || value === undefined ? null : value;
}

/** Flat row used by the products list, POS lookup and inventory. */
export function toVariantRow(variant) {
  const product = variant.product;
  return {
    id: variant.id,
    productId: variant.productId,
    productCode: product?.code,
    productName: product?.name,
    name: variant.name,
    displayName: [product?.name, variant.name].filter(Boolean).join(" - "),
    sku: variant.sku,
    barcode: variant.barcode,
    hsnCode: variant.hsnCode || product?.hsnCode || null,
    size: variant.size?.name || null,
    color: variant.color?.name || null,
    sizeId: variant.sizeId,
    colorId: variant.colorId,
    brand: product?.brand?.name || null,
    category: product?.category?.name || null,
    unit: product?.unit?.name || null,
    pricingMethod: product?.pricingMethod || "NONE",
    purchasePrice: variant.purchasePrice,
    retailPrice: variant.retailPrice,
    dealerPrice: variant.dealerPrice,
    customizedPrice: variant.customizedPrice,
    discountPercent: variant.discountPercent,
    gstPercent: variant.gstPercent,
    stockQuantity: variant.stockQuantity,
    minStockLevel: variant.minStockLevel,
    stockStatus: stockStatus(variant.stockQuantity, variant.minStockLevel),
    isActive: variant.isActive && (product?.isActive ?? true),
  };
}

function variantDisplayName(input, masterNames) {
  if (input.name && input.name.trim()) return input.name.trim();
  return [masterNames.get(Number(input.sizeId)), masterNames.get(Number(input.colorId))].filter(Boolean).join(" / ");
}

async function loadMasterNames(variants, transaction) {
  const ids = variants.flatMap((variant) => [variant.sizeId, variant.colorId]).filter(Boolean).map(Number);
  if (ids.length === 0) return new Map();
  const masters = await Master.findAll({ where: { id: { [Op.in]: ids } }, attributes: masterAttributes, transaction });
  return new Map(masters.map((master) => [master.id, master.name]));
}

/** Rejects duplicate SKUs/barcodes inside the payload and against other variants in the DB. */
async function assertUniqueCodes(variants, transaction) {
  const errors = [];
  const seen = { sku: new Map(), barcode: new Map() };

  variants.forEach((variant, row) => {
    for (const field of ["sku", "barcode"]) {
      const value = variant[field] ? String(variant[field]).trim().toUpperCase() : null;
      if (!value) continue;
      if (seen[field].has(value)) {
        errors.push({ row, field, message: `Duplicate ${field === "sku" ? "code" : "barcode"} ${variant[field]} in this list.` });
      }
      seen[field].set(value, row);
    }
  });

  for (const field of ["sku", "barcode"]) {
    const values = [...seen[field].keys()];
    if (values.length === 0) continue;
    const existing = await ProductVariant.findAll({
      where: { [field]: { [Op.in]: values } },
      attributes: ["id", field],
      transaction,
    });
    for (const match of existing) {
      const row = seen[field].get(String(match[field]).toUpperCase());
      if (Number(variants[row].id) !== match.id) {
        errors.push({ row, field, message: `${field === "sku" ? "Code" : "Barcode"} ${match[field]} is already used.` });
      }
    }
  }

  if (errors.length > 0) {
    throw createHttpError(409, "Some codes are already in use.", errors);
  }
}

function variantValues(input, product, masterNames) {
  return {
    ...pick(input, VARIANT_FIELDS),
    sku: String(input.sku).trim(),
    barcode: emptyToNull(input.barcode?.trim?.() ?? input.barcode),
    sizeId: emptyToNull(input.sizeId),
    colorId: emptyToNull(input.colorId),
    hsnCode: emptyToNull(input.hsnCode) ?? product.hsnCode,
    name: variantDisplayName(input, masterNames),
  };
}

async function createVariant(product, input, masterNames, userId, transaction) {
  const variant = await ProductVariant.create(
    { ...variantValues(input, product, masterNames), productId: product.id, stockQuantity: 0 },
    { transaction },
  );
  const opening = Number(input.openingStock || 0);
  if (opening > 0) {
    await variant.update({ stockQuantity: opening }, { transaction });
    await StockMovement.create(
      { variantId: variant.id, type: MOVEMENT_TYPES.OPENING, quantity: opening, balanceAfter: opening, note: "Opening stock", userId },
      { transaction },
    );
  }
  return variant;
}

export async function getProduct(id) {
  const product = await Product.findByPk(id, {
    include: [
      ...productInclude,
      {
        model: ProductVariant,
        as: "variants",
        include: [
          { model: Master, as: "size", attributes: masterAttributes },
          { model: Master, as: "color", attributes: masterAttributes },
        ],
      },
    ],
    order: [[{ model: ProductVariant, as: "variants" }, "sku", "ASC"]],
  });
  if (!product) throw createHttpError(404, "Product not found.");

  const json = product.toJSON();
  json.variants = product.variants.map((variant) => ({
    ...variant.toJSON(),
    stockStatus: stockStatus(variant.stockQuantity, variant.minStockLevel),
  }));
  return json;
}

async function assertProductCodeFree(code, productId, transaction) {
  const existing = await Product.findOne({ where: { code }, attributes: ["id"], transaction });
  if (existing && existing.id !== Number(productId)) {
    throw createHttpError(409, `Product code ${code} is already used.`, [{ field: "code", message: "Code already used." }]);
  }
}

export async function createProduct(input, userId) {
  const productId = await sequelize.transaction(async (transaction) => {
    await assertProductCodeFree(input.code, null, transaction);
    await assertUniqueCodes(input.variants, transaction);

    const product = await Product.create(
      { ...pick(input, PRODUCT_FIELDS), code: input.code.trim(), hsnCode: emptyToNull(input.hsnCode) },
      { transaction },
    );
    const masterNames = await loadMasterNames(input.variants, transaction);
    for (const variant of input.variants) {
      await createVariant(product, variant, masterNames, userId, transaction);
    }
    return product.id;
  });
  return getProduct(productId);
}

export async function updateProduct(id, input, userId) {
  await sequelize.transaction(async (transaction) => {
    const product = await Product.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!product) throw createHttpError(404, "Product not found.");

    if (input.code) await assertProductCodeFree(input.code.trim(), id, transaction);
    await assertUniqueCodes(input.variants, transaction);

    await product.update(
      { ...pick(input, PRODUCT_FIELDS), ...(input.code && { code: input.code.trim() }), hsnCode: emptyToNull(input.hsnCode) },
      { transaction },
    );

    const existing = await ProductVariant.findAll({ where: { productId: product.id }, transaction });
    const keptIds = new Set(input.variants.filter((variant) => variant.id).map((variant) => Number(variant.id)));
    const masterNames = await loadMasterNames(input.variants, transaction);

    for (const variant of existing) {
      if (keptIds.has(variant.id)) continue;
      // Variants on past invoices stay for history; unused ones can go.
      const billed = await InvoiceItem.count({ where: { variantId: variant.id }, transaction });
      if (billed > 0) {
        await variant.update({ isActive: false }, { transaction });
      } else {
        await StockMovement.destroy({ where: { variantId: variant.id }, transaction });
        await variant.destroy({ transaction });
      }
    }

    for (const variantInput of input.variants) {
      if (variantInput.id) {
        const variant = existing.find((candidate) => candidate.id === Number(variantInput.id));
        if (!variant) throw createHttpError(400, `Variant ${variantInput.id} does not belong to this product.`);
        await variant.update(variantValues(variantInput, product, masterNames), { transaction });
      } else {
        await createVariant(product, variantInput, masterNames, userId, transaction);
      }
    }
  });
  return getProduct(id);
}

export async function setProductStatus(id, isActive) {
  const product = await Product.findByPk(id);
  if (!product) throw createHttpError(404, "Product not found.");
  await product.update({ isActive });
  return getProduct(id);
}

export async function setVariantStatus(id, isActive) {
  const variant = await ProductVariant.findByPk(id);
  if (!variant) throw createHttpError(404, "Variant not found.");
  await variant.update({ isActive });
  return { id: variant.id, isActive: variant.isActive };
}

/** Next free code for a prefix: LOUV → LOUV16 (keeps the widest existing padding). */
export async function nextVariantCode(prefix) {
  const cleanPrefix = String(prefix || "").trim();
  if (!cleanPrefix) throw createHttpError(400, "Prefix is required.");

  const variants = await ProductVariant.findAll({
    where: { sku: { [Op.like]: `${cleanPrefix}%` } },
    attributes: ["sku"],
  });
  let highest = 0;
  let width = 2;
  for (const { sku } of variants) {
    const suffix = sku.slice(cleanPrefix.length);
    if (/^\d+$/.test(suffix)) {
      highest = Math.max(highest, Number(suffix));
      width = Math.max(width, suffix.length);
    }
  }
  return `${cleanPrefix}${String(highest + 1).padStart(width, "0")}`;
}

const VARIANT_SORTS = {
  code: [["sku"]],
  name: [[{ model: Product, as: "product" }, "name"], ["name"]],
  brand: [[{ model: Product, as: "product" }, { model: Master, as: "brand" }, "name"]],
  hsn: [["hsnCode"]],
  size: [[{ model: Master, as: "size" }, "name"]],
  color: [[{ model: Master, as: "color" }, "name"]],
  tax: [["gstPercent"]],
  price: [["retailPrice"]],
  stock: [["stockQuantity"]],
  created: [["id"]],
};

function variantWhere(query) {
  const where = {};
  const productWhere = {};
  if (query.categoryId) productWhere.categoryId = query.categoryId;
  if (query.brandId) productWhere.brandId = query.brandId;
  if (query.active === "true") {
    where.isActive = true;
    productWhere.isActive = true;
  } else if (query.active === "false") {
    where.isActive = false;
  }
  if (query.search) {
    const term = `%${query.search.trim()}%`;
    where[Op.or] = [
      { sku: { [Op.like]: term } },
      { barcode: { [Op.like]: term } },
      { name: { [Op.like]: term } },
      { hsnCode: { [Op.like]: term } },
      { "$product.name$": { [Op.like]: term } },
      { "$product.code$": { [Op.like]: term } },
    ];
  }
  return { where, productWhere };
}

function variantQuery(query) {
  const { where, productWhere } = variantWhere(query);
  const direction = String(query.order).toLowerCase() === "desc" ? "DESC" : "ASC";
  const sort = VARIANT_SORTS[query.sort] || VARIANT_SORTS.code;
  return {
    where,
    include: [
      { ...variantInclude[0], where: productWhere, required: true },
      variantInclude[1],
      variantInclude[2],
    ],
    order: sort.map((path) => [...path, direction]),
    subQuery: false,
  };
}

export async function listVariantRows(query) {
  const paging = parsePagination(query);
  const { rows, count } = await ProductVariant.findAndCountAll({
    ...variantQuery(query),
    limit: paging.limit,
    offset: paging.offset,
    distinct: true,
  });
  return pagedResult(rows.map(toVariantRow), count, paging);
}

export async function exportVariants(query) {
  const variants = await ProductVariant.findAll(variantQuery(query));
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.columns = [
    { header: "#", key: "index", width: 6 },
    { header: "Code", key: "sku", width: 14 },
    { header: "Barcode", key: "barcode", width: 16 },
    { header: "Brand", key: "brand", width: 16 },
    { header: "Category", key: "category", width: 16 },
    { header: "Name", key: "productName", width: 28 },
    { header: "Variant", key: "name", width: 22 },
    { header: "HSN", key: "hsnCode", width: 12 },
    { header: "Size", key: "size", width: 12 },
    { header: "Color", key: "color", width: 18 },
    { header: "Unit", key: "unit", width: 8 },
    { header: "Tax %", key: "gstPercent", width: 8 },
    { header: "Actual Cost", key: "purchasePrice", width: 12 },
    { header: "Retail Cost", key: "retailPrice", width: 12 },
    { header: "Dealer Cost", key: "dealerPrice", width: 12 },
    { header: "Customized Cost", key: "customizedPrice", width: 15 },
    { header: "Stock", key: "stockQuantity", width: 10 },
    { header: "Active", key: "active", width: 8 },
  ];
  sheet.getRow(1).font = { bold: true };
  variants.map(toVariantRow).forEach((row, index) => {
    sheet.addRow({ ...row, index: index + 1, active: row.isActive ? "Yes" : "No" });
  });
  for (const key of ["purchasePrice", "retailPrice", "dealerPrice", "customizedPrice"]) {
    sheet.getColumn(key).numFmt = "#,##0.00";
  }
  return workbook.xlsx.writeBuffer();
}

const BULK_FIELDS = {
  names: ["productName", "name"],
  "price-code": ["sku", "barcode", "purchasePrice", "retailPrice", "dealerPrice", "customizedPrice"],
  "gst-hsn": ["gstPercent", "hsnCode"],
};

/** Applies one bulk-edit screen's changed rows atomically. */
export async function bulkUpdate(kind, rows) {
  const fields = BULK_FIELDS[kind];
  if (!fields) throw createHttpError(404, "Unknown bulk update.");

  await sequelize.transaction(async (transaction) => {
    const variants = await ProductVariant.findAll({
      where: { id: { [Op.in]: rows.map((row) => row.variantId) } },
      include: [{ model: Product, as: "product" }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const byId = new Map(variants.map((variant) => [variant.id, variant]));
    const missing = rows.map((row, index) => ({ row: index, id: row.variantId })).filter(({ id }) => !byId.has(Number(id)));
    if (missing.length > 0) {
      throw createHttpError(404, "Some products no longer exist.", missing.map(({ row }) => ({ row, message: "Not found." })));
    }

    if (kind === "price-code") {
      await assertUniqueCodes(
        rows.map((row) => ({ id: row.variantId, sku: row.sku ?? byId.get(Number(row.variantId)).sku, barcode: row.barcode })),
        transaction,
      );
    }

    for (const row of rows) {
      const variant = byId.get(Number(row.variantId));
      const changes = pick(row, fields.filter((field) => field !== "productName"));
      if ("barcode" in changes) changes.barcode = emptyToNull(changes.barcode);
      if ("hsnCode" in changes) changes.hsnCode = emptyToNull(changes.hsnCode);
      if (Object.keys(changes).length > 0) await variant.update(changes, { transaction });
      if (row.productName && row.productName.trim() !== variant.product.name) {
        await variant.product.update({ name: row.productName.trim() }, { transaction });
      }
    }
  });
  return { updated: rows.length };
}

/** POS / Sales Order search: active items by code, barcode or name. */
export async function lookupVariants(q, limit = 20) {
  const term = String(q || "").trim();
  if (!term) return [];
  const variants = await ProductVariant.findAll({
    where: {
      isActive: true,
      [Op.or]: [
        { sku: { [Op.like]: `${term}%` } },
        { barcode: term },
        { name: { [Op.like]: `%${term}%` } },
        { "$product.name$": { [Op.like]: `%${term}%` } },
      ],
    },
    include: [{ ...variantInclude[0], where: { isActive: true }, required: true }, variantInclude[1], variantInclude[2]],
    order: [[{ model: Product, as: "product" }, "name", "ASC"], ["sku", "ASC"]],
    limit,
    subQuery: false,
  });
  return variants.map(toVariantRow);
}

/** Exact barcode (or code) match for scanner input. */
export async function findByBarcode(code) {
  const term = String(code || "").trim();
  const variant = await ProductVariant.findOne({
    where: { isActive: true, [Op.or]: [{ barcode: term }, { sku: term }] },
    include: [{ ...variantInclude[0], where: { isActive: true }, required: true }, variantInclude[1], variantInclude[2]],
  });
  if (!variant) throw createHttpError(404, `No product found for ${term}.`);
  return toVariantRow(variant);
}
