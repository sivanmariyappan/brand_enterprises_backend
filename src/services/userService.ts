import crypto from "node:crypto";
import User from "../models/User.js";
import { createHttpError } from "../middleware/errorHandler.js";
import { createUser, findUserByEmail, updatePassword } from "../repositories/userRepository.js";
import { toPublicUser } from "./authService.js";

export async function listUsers() {
  const users = await User.findAll({ order: [["name", "ASC"]] });
  return users.map(toPublicUser);
}

/** Active users for dropdowns such as "Sales Rep". */
export async function lookupUsers() {
  const users = await User.findAll({ where: { isActive: true }, attributes: ["id", "name"], order: [["name", "ASC"]] });
  return users.map((user) => ({ id: user.id, name: user.name }));
}

export async function addUser({ name, email, password, role }) {
  if (await findUserByEmail(email)) {
    throw createHttpError(409, "An account with that email already exists.");
  }
  const user = await createUser({ id: crypto.randomUUID(), name, email, password, role });
  return toPublicUser(user);
}

export async function editUser(id, { name, role, isActive, password }, currentUserId) {
  const user = await User.findByPk(id);
  if (!user) throw createHttpError(404, "User not found.");

  if (id === currentUserId && (isActive === false || (role && role !== user.role))) {
    throw createHttpError(400, "You cannot deactivate yourself or change your own role.");
  }

  await user.update({
    ...(name !== undefined && { name }),
    ...(role !== undefined && { role }),
    ...(isActive !== undefined && { isActive }),
  });
  if (password) await updatePassword(user, password);
  return toPublicUser(user);
}
