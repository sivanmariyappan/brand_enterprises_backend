import { validationResult } from "express-validator";

export function validateRequest(request, response, next) {
  const result = validationResult(request);

  if (!result.isEmpty()) {
    response.status(400).json({
      success: false,
      message: "Validation failed.",
      errors: result.array(),
    });
    return;
  }

  next();
}