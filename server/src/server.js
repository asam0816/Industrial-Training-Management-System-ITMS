import app from "./app.js";
import { connectDB } from "./config/db.js";
import { env } from "./config/env.js";
try {
  await connectDB();
  app.listen(env.port, () =>
    console.log(`ITMS Server running on http://localhost:${env.port}`),
  );
} catch (e) {
  console.error("Database connection failed:", e.message);
  process.exit(1);
}
