import { Master, Product } from "../models/index.js";
import { MASTER_TYPES } from "../models/Master.js";
import { seedDevelopmentUsers } from "../repositories/userRepository.js";
import { seedMasters } from "../services/masterService.js";
import { createProduct } from "../services/productService.js";
import { getSettings } from "../services/settingsService.js";

const SAMPLE_MASTERS = {
  CATEGORY: ["Grocery", "Building Materials"],
  BRAND: ["Gold Winner", "India Gate", "CHENNU"],
  SIZE: ["500 ml", "1 Litre", "2 Litre", "5 Litre", "1 KG", "5 KG", "9G", "2G", "Corner", "H", "U", "L"],
  COLOR: ["WP01-Teak", "WP21-Silver", "WP22-Coffee", "White Oak", "WP29-Mehogany"],
  PVC_TYPE: ["Rigid", "Foam"],
  VALUE_ADDED: ["Cutting", "Fixing", "Packing"],
};

async function ensureMasters() {
  const ids = {};
  for (const [type, names] of Object.entries(SAMPLE_MASTERS)) {
    for (const [index, name] of names.entries()) {
      const [master] = await Master.findOrCreate({ where: { type, name }, defaults: { sortOrder: index } });
      ids[`${type}:${name}`] = master.id;
    }
  }
  const units = await Master.findAll({ where: { type: MASTER_TYPES.UNIT } });
  for (const unit of units) ids[`UNIT:${unit.name}`] = unit.id;
  return ids;
}

function variant(sku, sizeId, colorId, prices, extra = {}) {
  const [purchasePrice, retailPrice, dealerPrice = retailPrice, customizedPrice = retailPrice] = prices;
  return { sku, sizeId, colorId, purchasePrice, retailPrice, dealerPrice, customizedPrice, openingStock: 50, minStockLevel: 10, ...extra };
}

async function seedSampleProducts(userId) {
  if ((await Product.count()) > 0) return;
  const m = await ensureMasters();

  const products = [
    {
      code: "OIL", name: "Cooking Oil", categoryId: m["CATEGORY:Grocery"], brandId: m["BRAND:Gold Winner"],
      unitId: m["UNIT:piece"], hsnCode: "15121110",
      variants: [
        variant("OIL01", m["SIZE:500 ml"], null, [95, 110, 105], { gstPercent: 5, barcode: "8901000000011" }),
        variant("OIL02", m["SIZE:1 Litre"], null, [170, 200, 190], { gstPercent: 18, discountPercent: 5, barcode: "8901000000028" }),
        variant("OIL03", m["SIZE:2 Litre"], null, [330, 380, 365], { gstPercent: 5, barcode: "8901000000035" }),
        variant("OIL04", m["SIZE:5 Litre"], null, [790, 900, 870], { gstPercent: 5, barcode: "8901000000042", openingStock: 8 }),
      ],
    },
    {
      code: "RICE", name: "Rice", categoryId: m["CATEGORY:Grocery"], brandId: m["BRAND:India Gate"],
      unitId: m["UNIT:pack"], hsnCode: "10063020",
      variants: [variant("RICE01", m["SIZE:5 KG"], null, [120, 150, 140], { gstPercent: 5, barcode: "8901000000059", openingStock: 3 })],
    },
    {
      code: "SUG", name: "Sugar", categoryId: m["CATEGORY:Grocery"], unitId: m["UNIT:pack"], hsnCode: "17019990",
      variants: [variant("SUG01", m["SIZE:1 KG"], null, [42, 50], { gstPercent: 5, barcode: "8901000000066" })],
    },
    {
      code: "LOUV", name: "CHENNU Louvers", categoryId: m["CATEGORY:Building Materials"], brandId: m["BRAND:CHENNU"],
      pvcTypeId: m["PVC_TYPE:Rigid"], unitId: m["UNIT:NOS"], hsnCode: "39259090",
      variants: [
        variant("LOUV01", m["SIZE:9G"], m["COLOR:WP01-Teak"], [480, 627.12, 590, 610], { gstPercent: 18 }),
        variant("LOUV03", m["SIZE:2G"], m["COLOR:WP01-Teak"], [480, 627.12, 590, 610], { gstPercent: 18 }),
        variant("LOUV05", m["SIZE:9G"], m["COLOR:WP21-Silver"], [480, 627.12, 590, 610], { gstPercent: 18 }),
        variant("LOUV49", m["SIZE:Corner"], m["COLOR:WP29-Mehogany"], [210, 280, 260, 270], { gstPercent: 18 }),
      ],
    },
    {
      code: "PNL", name: "PVC Wall Panel", categoryId: m["CATEGORY:Building Materials"], brandId: m["BRAND:CHENNU"],
      pvcTypeId: m["PVC_TYPE:Foam"], unitId: m["UNIT:sqft"], pricingMethod: "SQFT", hsnCode: "39259090",
      variants: [variant("PNL01", null, m["COLOR:White Oak"], [45, 65, 58, 60], { gstPercent: 18, name: "8 mm / White Oak" })],
    },
  ];

  for (const product of products) {
    await createProduct(product, userId);
  }
  console.log(`Seeded ${products.length} sample products.`);
}

export async function seedDevelopmentData() {
  await seedDevelopmentUsers();
  await seedMasters();
  await getSettings();
  await seedSampleProducts("user-1");
}

/** Needed in every environment: default units and the settings row. */
export async function seedRequiredData() {
  await seedMasters();
  await getSettings();
}
