import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { createHttpError } from "./errorHandler.js";

export function requireAuth(request, response, next) {
  const authorization = request.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : null;

  if (!token) {
    next(createHttpError(401, "Authentication token is required."));
    return;
  }

  try {
    request.user = jwt.verify(token, env.jwtSecret);
    next();
  } catch {
    next(createHttpError(401, "Invalid or expired authentication token."));
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!roles.includes(request.user?.role)) {
      next(createHttpError(403, "You do not have permission to do this."));
      return;
    }
    next();
  };
}
