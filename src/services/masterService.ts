import { UniqueConstraintError } from "sequelize";
import Master, { MASTER_TYPES } from "../models/Master.js";
import { createHttpError } from "../middleware/errorHandler.js";

function toMaster(master) {
  return { id: master.id, type: master.type, name: master.name, sortOrder: master.sortOrder, isActive: master.isActive };
}

/** All masters grouped by type, e.g. { SIZE: [...], COLOR: [...] }. */
export async function listMasters({ type, includeInactive = false } = {}) {
  const where = {};
  if (type) where.type = type;
  if (!includeInactive) where.isActive = true;

  const masters = await Master.findAll({ where, order: [["type", "ASC"], ["sortOrder", "ASC"], ["name", "ASC"]] });
  const grouped = Object.fromEntries(Object.values(MASTER_TYPES).map((key) => [key, []]));
  for (const master of masters) grouped[master.type].push(toMaster(master));
  return type ? grouped[type] : grouped;
}

async function saveMaster(action) {
  try {
    return toMaster(await action());
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw createHttpError(409, "A value with that name already exists.");
    }
    throw error;
  }
}

export async function createMaster({ type, name, sortOrder = 0 }) {
  return saveMaster(() => Master.create({ type, name: name.trim(), sortOrder }));
}

export async function updateMaster(id, { name, sortOrder, isActive }) {
  const master = await Master.findByPk(id);
  if (!master) throw createHttpError(404, "Value not found.");
  return saveMaster(() =>
    master.update({
      ...(name !== undefined && { name: name.trim() }),
      ...(sortOrder !== undefined && { sortOrder }),
      ...(isActive !== undefined && { isActive }),
    }),
  );
}

const DEFAULT_UNITS = ["NOS", "piece", "pack", "dozen", "ml", "litre", "gram", "kg", "metre", "sqft"];

export async function seedMasters() {
  if ((await Master.count({ where: { type: MASTER_TYPES.UNIT } })) > 0) return;
  await Master.bulkCreate(
    DEFAULT_UNITS.map((name, index) => ({ type: MASTER_TYPES.UNIT, name, sortOrder: index })),
    { ignoreDuplicates: true },
  );
}
