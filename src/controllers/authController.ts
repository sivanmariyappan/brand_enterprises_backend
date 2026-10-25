import * as authService from "../services/authService.js";

export async function login(request, response) {
  const result = await authService.login(request.body);
  response.json({ success: true, data: result });
}

export async function forgotPassword(request, response) {
  await authService.requestPasswordReset(request.body.email);
  response.json({
    success: true,
    message: "If that email exists, a reset link has been sent.",
  });
}

export async function updatePassword(request, response) {
  await authService.resetPassword(request.body);
  response.json({ success: true, message: "Password updated successfully." });
}

export async function me(request, response) {
  const result = await authService.getCurrentUser(request.user.sub);
  response.json({ success: true, data: result });
}
