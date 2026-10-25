import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import User, { ROLES } from "../models/User.js";

export async function findUserByEmail(email) {
  return User.findOne({ where: { email: email.toLowerCase() } });
}

export async function findUserById(id) {
  return User.findByPk(id);
}

export async function createUser({ id, name, email, password, role = ROLES.CASHIER }) {
  return User.create({
    id,
    name,
    email: email.toLowerCase(),
    role,
    passwordHash: await bcrypt.hash(password, 12),
    resetTokenHash: null,
    resetTokenExpiresAt: null,
  });
}

export async function updatePassword(user, password) {
  return user.update({
    passwordHash: await bcrypt.hash(password, 12),
    resetTokenHash: null,
    resetTokenExpiresAt: null,
  });
}

export async function saveResetToken(user, resetTokenHash, resetTokenExpiresAt) {
  return user.update({ resetTokenHash, resetTokenExpiresAt: new Date(resetTokenExpiresAt) });
}

export async function findUserByResetToken(resetTokenHash) {
  return User.findOne({
    where: {
      resetTokenHash,
      resetTokenExpiresAt: { [Op.gt]: new Date() },
    },
  });
}

const developmentUsers = [
  { id: "user-1", name: "Admin", email: "demo@brandenterprises.com", role: ROLES.ADMIN },
  { id: "user-2", name: "Cashier", email: "cashier@brandenterprises.com", role: ROLES.CASHIER },
];

export async function seedDevelopmentUsers() {
  for (const seed of developmentUsers) {
    const existing = await findUserByEmail(seed.email);
    if (!existing) {
      await createUser({ ...seed, password: "Password123!" });
    } else if (!existing.name) {
      // Accounts created before roles existed.
      await existing.update({ name: seed.name, role: seed.role });
    }
  }
}
