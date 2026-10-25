import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import { createHttpError } from "../middleware/errorHandler.js";
import { sendPasswordResetEmail } from "./mailService.js";
import {
  findUserByEmail,
  findUserById,
  findUserByResetToken,
  saveResetToken,
  updatePassword,
} from "../repositories/userRepository.js";

export function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive };
}

function createAccessToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function login({ email, password }) {
  const user = await findUserByEmail(email);
  const passwordMatches = user && (await bcrypt.compare(password, user.passwordHash));

  if (!passwordMatches) {
    throw createHttpError(401, "Invalid email or password.");
  }
  if (!user.isActive) {
    throw createHttpError(403, "This account has been deactivated.");
  }

  return { user: toPublicUser(user), token: createAccessToken(user) };
}

export async function requestPasswordReset(email) {
  const user = await findUserByEmail(email);

  // Keep the response generic so account existence is not disclosed.
  if (user && user.isActive) {
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = Date.now() + env.resetTokenExpiresInMinutes * 60 * 1000;
    await saveResetToken(user, hashToken(resetToken), expiresAt);
    await sendPasswordResetEmail({ email: user.email, resetToken });
  }
}

export async function resetPassword({ token, password }) {
  const user = await findUserByResetToken(hashToken(token));

  if (!user) {
    throw createHttpError(400, "Invalid or expired password reset token.");
  }

  await updatePassword(user, password);
}

export async function getCurrentUser(userId) {
  const user = await findUserById(userId);

  if (!user || !user.isActive) {
    throw createHttpError(401, "Account no longer exists.");
  }

  return { user: toPublicUser(user) };
}
