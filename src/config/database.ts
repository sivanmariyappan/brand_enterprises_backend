import { Sequelize } from "sequelize";
import { env } from "./env.js";

export const sequelize = new Sequelize(
  env.database.name,
  env.database.user,
  env.database.password,
  {
    host: env.database.host,
    port: env.database.port,
    dialect: "mysql",
    logging: env.database.logging ? console.log : false,
    // Store and group dates in Indian Standard Time so "today" and monthly
    // reports line up with the shop's calendar.
    timezone: "+05:30",
    dialectOptions: {
      // Return DECIMAL columns as numbers instead of strings.
      decimalNumbers: true,
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    define: {
      underscored: true,
      timestamps: true,
    },
  },
);

export async function connectDatabase() {
  await sequelize.authenticate();
  // Registers every model and association before syncing.
  await import("../models/index.js");
  await sequelize.sync({ alter: env.nodeEnv === "development" });
  console.log(`MySQL connected: ${env.database.name}`);
}
