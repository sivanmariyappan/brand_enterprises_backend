import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import authRoutes from "./routes/authRoutes.js";
import apiRoutes from "./routes/apiRoutes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

const app = express();

app.disable("x-powered-by");
app.use(
  cors({
    origin: env.clientOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: false, limit: "10kb" }));

app.get("/health", (request, response) => {
  response.json({ success: true, status: "ok" });
});
app.use("/api/auth", authRoutes);
app.use("/api", apiRoutes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;