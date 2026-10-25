// Development only: wipes sales, customers, stock history and products, then
// re-seeds the sample catalogue with opening stock. Users, shop settings and
// master lists are kept. Run with `npm run db:reset`.
import { env } from "../config/env.js";
import { connectDatabase, sequelize } from "../config/database.js";
import { seedDevelopmentData } from "./developmentSeed.js";

const TABLES = [
  "return_items",
  "returns",
  "payments",
  "invoice_items",
  "invoices",
  "invoice_counters",
  "stock_movements",
  "customers",
  "product_variants",
  "products",
];

if (env.nodeEnv !== "development") {
  console.error(`Refusing to reset data: NODE_ENV is "${env.nodeEnv}", not "development".`);
  process.exit(1);
}

await connectDatabase();
await sequelize.transaction(async (transaction) => {
  for (const table of TABLES) {
    await sequelize.query(`DELETE FROM \`${table}\``, { transaction });
  }
});
for (const table of TABLES) {
  await sequelize.query(`ALTER TABLE \`${table}\` AUTO_INCREMENT = 1`).catch(() => {});
}
await seedDevelopmentData();

const [[counts]] = await sequelize.query(
  "SELECT (SELECT COUNT(*) FROM invoices) AS invoices, (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM product_variants) AS variants, (SELECT COUNT(*) FROM customers) AS customers",
);
console.log(`Reset done: ${counts.invoices} invoices, ${counts.products} products, ${counts.variants} variants, ${counts.customers} customers.`);
await sequelize.close();
