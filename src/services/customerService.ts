import { Op, UniqueConstraintError } from "sequelize";
import Customer from "../models/Customer.js";
import { createHttpError } from "../middleware/errorHandler.js";
import { pagedResult, parsePagination } from "../utils/pagination.js";

const FIELDS = ["name", "phone", "email", "priceTier", "gstin", "stateCode", "billingAddress", "deliveryAddress", "isActive"];

function clean(input) {
  const values = Object.fromEntries(FIELDS.filter((key) => input[key] !== undefined).map((key) => [key, input[key]]));
  for (const key of ["phone", "email", "gstin", "stateCode", "billingAddress", "deliveryAddress"]) {
    if (key in values) values[key] = values[key] === "" || values[key] === null ? null : String(values[key]).trim();
  }
  if (values.gstin) values.gstin = values.gstin.toUpperCase();
  if (values.name) values.name = values.name.trim();
  return values;
}

async function save(action) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw createHttpError(409, "A customer with this phone number already exists.", [
        { field: "phone", message: "Phone number already used." },
      ]);
    }
    throw error;
  }
}

function searchWhere(term) {
  const like = `%${term.trim()}%`;
  return { [Op.or]: [{ name: { [Op.like]: like } }, { phone: { [Op.like]: like } }, { gstin: { [Op.like]: like } }] };
}

/** Autocomplete for POS / Sales Order. */
export async function searchCustomers(q, limit = 15) {
  const where = { isActive: true, ...(q ? searchWhere(q) : {}) };
  return Customer.findAll({ where, order: [["name", "ASC"]], limit });
}

export async function listCustomers(query) {
  const paging = parsePagination(query);
  const where = query.search ? searchWhere(query.search) : {};
  if (query.priceTier) where.priceTier = query.priceTier;
  const { rows, count } = await Customer.findAndCountAll({
    where,
    order: [["name", "ASC"]],
    limit: paging.limit,
    offset: paging.offset,
  });
  return pagedResult(rows, count, paging);
}

export async function getCustomer(id, transaction) {
  const customer = await Customer.findByPk(id, { transaction });
  if (!customer) throw createHttpError(404, "Customer not found.");
  return customer;
}

export async function createCustomer(input, transaction) {
  return save(() => Customer.create(clean(input), { transaction }));
}

export async function updateCustomer(id, input) {
  const customer = await getCustomer(id);
  return save(() => customer.update(clean(input)));
}

export async function findCustomerByPhone(phone, transaction) {
  if (!phone) return null;
  return Customer.findOne({ where: { phone: String(phone).trim() }, transaction });
}
