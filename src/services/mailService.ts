import nodemailer from "nodemailer";
import { env } from "../config/env.js";

const isMailConfigured = Boolean(env.mail.host && env.mail.user && env.mail.password);

const transporter = isMailConfigured
  ? nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.secure,
      auth: {
        user: env.mail.user,
        pass: env.mail.password,
      },
    })
  : null;

export async function sendPasswordResetEmail({ email, resetToken }) {
  const resetUrl = `${env.frontendUrl}/update-password?token=${encodeURIComponent(resetToken)}`;

  if (!transporter) {
    if (env.nodeEnv === "development") {
      // Lets the reset flow be tested locally without SMTP credentials.
      console.log(`[mail] SMTP not configured. Password reset link for ${email}: ${resetUrl}`);
      return;
    }
    throw new Error("SMTP is not configured: set SMTP_HOST, SMTP_USER and SMTP_PASSWORD.");
  }

  await transporter.sendMail({
    from: env.mail.from,
    to: email,
    subject: "Reset your Brand Enterprises password",
    text: `Reset your password using this link: ${resetUrl}\n\nThis link expires in ${env.resetTokenExpiresInMinutes} minutes.`,
    html: `
      <p>We received a request to reset your Brand Enterprises password.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in ${env.resetTokenExpiresInMinutes} minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
}
