import * as settingsService from "../services/settingsService.js";
import * as userService from "../services/userService.js";
import * as masterService from "../services/masterService.js";
import * as productService from "../services/productService.js";
import * as inventoryService from "../services/inventoryService.js";
import * as customerService from "../services/customerService.js";

const ok = (response, data, status = 200) => response.status(status).json({ success: true, data });
const okPaged = (response, result) => response.json({ success: true, ...result });

// Settings
export async function getSettings(request, response) {
  ok(response, await settingsService.getSettings());
}
export async function updateSettings(request, response) {
  ok(response, await settingsService.updateSettings(request.body));
}

// Users
export async function listUsers(request, response) {
  ok(response, await userService.listUsers());
}
export async function lookupUsers(request, response) {
  ok(response, await userService.lookupUsers());
}
export async function createUser(request, response) {
  ok(response, await userService.addUser(request.body), 201);
}
export async function updateUser(request, response) {
  ok(response, await userService.editUser(request.params.id, request.body, request.user.sub));
}

// Masters
export async function listMasters(request, response) {
  ok(response, await masterService.listMasters({ type: request.query.type, includeInactive: request.query.all === "true" }));
}
export async function createMaster(request, response) {
  ok(response, await masterService.createMaster(request.body), 201);
}
export async function updateMaster(request, response) {
  ok(response, await masterService.updateMaster(request.params.id, request.body));
}

// Products
export async function listVariantRows(request, response) {
  okPaged(response, await productService.listVariantRows(request.query));
}
export async function exportProducts(request, response) {
  const buffer = await productService.exportVariants(request.query);
  response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  response.setHeader("Content-Disposition", `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  response.send(Buffer.from(buffer));
}
export async function nextVariantCode(request, response) {
  ok(response, { code: await productService.nextVariantCode(request.query.prefix) });
}
export async function getProduct(request, response) {
  ok(response, await productService.getProduct(request.params.id));
}
export async function createProduct(request, response) {
  ok(response, await productService.createProduct(request.body, request.user.sub), 201);
}
export async function updateProduct(request, response) {
  ok(response, await productService.updateProduct(request.params.id, request.body, request.user.sub));
}
export async function setProductStatus(request, response) {
  ok(response, await productService.setProductStatus(request.params.id, request.body.isActive));
}
export async function setVariantStatus(request, response) {
  ok(response, await productService.setVariantStatus(request.params.id, request.body.isActive));
}
export async function bulkUpdate(request, response) {
  ok(response, await productService.bulkUpdate(request.params.kind, request.body.rows));
}
export async function lookupVariants(request, response) {
  ok(response, await productService.lookupVariants(request.query.q));
}
export async function findByBarcode(request, response) {
  ok(response, await productService.findByBarcode(request.params.code));
}

// Inventory
export async function listInventory(request, response) {
  okPaged(response, await inventoryService.listInventory(request.query));
}
export async function listLowStock(request, response) {
  ok(response, await inventoryService.listLowStock(request.query.limit || 50));
}
export async function adjustStock(request, response) {
  ok(response, await inventoryService.adjustStock(request.params.variantId, request.body, request.user.sub));
}
export async function listMovements(request, response) {
  okPaged(response, await inventoryService.listMovements(request.params.variantId, request.query));
}

// Customers
export async function listCustomers(request, response) {
  if (request.query.lookup === "true") {
    ok(response, await customerService.searchCustomers(request.query.search));
    return;
  }
  okPaged(response, await customerService.listCustomers(request.query));
}
export async function getCustomer(request, response) {
  ok(response, await customerService.getCustomer(request.params.id));
}
export async function createCustomer(request, response) {
  ok(response, await customerService.createCustomer(request.body), 201);
}
export async function updateCustomer(request, response) {
  ok(response, await customerService.updateCustomer(request.params.id, request.body));
}
