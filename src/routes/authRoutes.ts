import { Router } from "express";
import { body } from "express-validator";
import * as authController from "../controllers/authController.js";
import { validateRequest } from "../middleware/requestValidation.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
const emailRule = body("email").trim().isEmail().withMessage("A valid email is required.");
const passwordRule = body("password")
  .isLength({ min: 8 })
  .withMessage("Password must be at least 8 characters.");

router.post(
  "/login",
  [emailRule, body("password").notEmpty().withMessage("Password is required.")],
  validateRequest,
  authController.login,
);

router.post(
  "/forgot-password",
  emailRule,
  validateRequest,
  authController.forgotPassword,
);

router.post(
  "/update-password",
  [
    body("token").trim().notEmpty().withMessage("Reset token is required."),
    passwordRule,
    body("confirmPassword")
      .custom((value, { req }) => value === req.body.password)
      .withMessage("Passwords must match."),
  ],
  validateRequest,
  authController.updatePassword,
);

router.get("/me", requireAuth, authController.me);

export default router;
