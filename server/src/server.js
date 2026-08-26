import app from "./app.js";

import { env } from "./config/env.js";
import { connectDB, disconnectDB } from "./config/db.js";

const PORT = Number(env.port || process.env.PORT) || 5000;

let server = null;

/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

async function startServer() {
  try {
    console.log("====================================");
    console.log("Starting ITMS Backend");
    console.log("====================================");

    console.log(
      `Environment: ${env.nodeEnv || process.env.NODE_ENV || "development"}`,
    );

    /*
    |--------------------------------------------------------------------------
    | CONNECT DATABASE FIRST
    |--------------------------------------------------------------------------
    */

    await connectDB();

    /*
    |--------------------------------------------------------------------------
    | START EXPRESS ONLY AFTER DB SUCCESS
    |--------------------------------------------------------------------------
    */

    server = app.listen(PORT, () => {
      console.log("====================================");
      console.log("ITMS Backend Started Successfully");
      console.log("====================================");

      console.log(`Server: http://localhost:${PORT}`);

      console.log(`Health: http://localhost:${PORT}/api/health`);

      console.log(`Database: http://localhost:${PORT}/api/health/db`);
    });
  } catch (error) {
    console.error("====================================");
    console.error("ITMS BACKEND STARTUP FAILED");
    console.error("====================================");

    console.error(error?.message || error);

    /*
     * Do not continue serving requests without MongoDB.
     */
    process.exitCode = 1;
  }
}

startServer();

/*
|--------------------------------------------------------------------------
| GRACEFUL SHUTDOWN
|--------------------------------------------------------------------------
*/

async function shutdown(signal) {
  console.log(`\n${signal} received.`);

  if (server) {
    server.close(async () => {
      console.log("HTTP server closed.");

      await disconnectDB();

      process.exit(0);
    });

    /*
     * Force shutdown if something gets stuck.
     */
    setTimeout(() => {
      console.error("Forced shutdown.");

      process.exit(1);
    }, 10000).unref();
  } else {
    await disconnectDB();

    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));

process.on("SIGTERM", () => shutdown("SIGTERM"));
