import app from "./app.js";
import { env } from "./config/env.js";
import { connectDatabase } from "./config/database.js";
import { seedDevelopmentData, seedRequiredData } from "./seeds/developmentSeed.js";

await connectDatabase();
await (env.nodeEnv === "development" ? seedDevelopmentData() : seedRequiredData());

app.listen(env.port, () => {
  console.log(`API server running at http://localhost:${env.port}`);
});
