import mongoose from "mongoose";
import dns from "node:dns";

import { env } from "./env.js";

/*
|--------------------------------------------------------------------------
| MONGOOSE CONFIGURATION
|--------------------------------------------------------------------------
|
| Disable mongoose command buffering.
|
| Without this, if MongoDB is unavailable, operations such as:
|
| User.findOne()
|
| can wait and finally produce:
|
| Operation `users.findOne()` buffering timed out...
|
| We prefer an immediate database error.
|
*/

mongoose.set("bufferCommands", false);

/*
|--------------------------------------------------------------------------
| OPTIONAL CUSTOM DNS
|--------------------------------------------------------------------------
|
| In local development you can add:
|
| MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8
|
| This can help when the ISP/router DNS refuses MongoDB SRV queries.
|
| On Vercel you normally don't need this.
|
*/

const customDnsServers = process.env.MONGODB_DNS_SERVERS?.split(",")
  .map((item) => item.trim())
  .filter(Boolean);

if (customDnsServers?.length) {
  try {
    dns.setServers(customDnsServers);

    console.log(
      `Custom MongoDB DNS servers enabled: ${customDnsServers.join(", ")}`,
    );
  } catch (error) {
    console.warn("Unable to configure custom DNS servers:", error.message);
  }
}

/*
|--------------------------------------------------------------------------
| GLOBAL CONNECTION CACHE
|--------------------------------------------------------------------------
|
| Important for:
|
| - nodemon
| - Vercel
| - serverless environments
| - hot reload
|
*/

const globalForMongoose = globalThis;

if (!globalForMongoose.__ITMS_MONGOOSE__) {
  globalForMongoose.__ITMS_MONGOOSE__ = {
    conn: null,
    promise: null,
  };
}

const cached = globalForMongoose.__ITMS_MONGOOSE__;

/*
|--------------------------------------------------------------------------
| MONGOOSE CONNECTION OPTIONS
|--------------------------------------------------------------------------
*/

const connectionOptions = {
  serverSelectionTimeoutMS: 15000,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 45000,

  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 60000,

  family: 4,
};

/*
|--------------------------------------------------------------------------
| CHECK FOR SRV/DNS ERRORS
|--------------------------------------------------------------------------
*/

function isSrvDnsError(error) {
  const message = String(error?.message || "");

  return (
    message.includes("querySrv") ||
    message.includes("ENOTFOUND") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ETIMEOUT") ||
    message.includes("SERVFAIL")
  );
}

/*
|--------------------------------------------------------------------------
| CONNECT USING URI
|--------------------------------------------------------------------------
*/

async function connectUsingUri(uri, connectionType = "primary") {
  console.log(`Connecting to MongoDB using ${connectionType} connection...`);

  const connection = await mongoose.connect(uri, connectionOptions);

  console.log("MongoDB connected successfully");

  console.log(`MongoDB readyState: ${mongoose.connection.readyState}`);

  console.log(`MongoDB database: ${mongoose.connection.name}`);

  console.log(`MongoDB host: ${mongoose.connection.host}`);

  return connection;
}

/*
|--------------------------------------------------------------------------
| MAIN DATABASE CONNECTION
|--------------------------------------------------------------------------
*/

export async function connectDB() {
  /*
  |--------------------------------------------------------------------------
  | RETURN EXISTING CONNECTION
  |--------------------------------------------------------------------------
  */

  if (cached.conn && mongoose.connection.readyState === 1) {
    return cached.conn;
  }

  /*
  |--------------------------------------------------------------------------
  | PRIMARY URI
  |--------------------------------------------------------------------------
  */

  const primaryUri = env.mongoUri || process.env.MONGODB_URI;

  if (!primaryUri) {
    throw new Error("MONGODB_URI environment variable is missing");
  }

  /*
  |--------------------------------------------------------------------------
  | OPTIONAL STANDARD CONNECTION STRING
  |--------------------------------------------------------------------------
  |
  | If mongodb+srv:// fails because DNS SRV lookup is blocked,
  | you can put a MongoDB STANDARD connection string here:
  |
  | MONGODB_URI_STANDARD=mongodb://...
  |
  */

  const standardUri = process.env.MONGODB_URI_STANDARD?.trim();

  /*
  |--------------------------------------------------------------------------
  | CREATE ONE CONNECTION PROMISE
  |--------------------------------------------------------------------------
  */

  if (!cached.promise) {
    cached.promise = (async () => {
      try {
        /*
        |--------------------------------------------------------------------------
        | TRY PRIMARY mongodb+srv CONNECTION
        |--------------------------------------------------------------------------
        */

        return await connectUsingUri(
          primaryUri,
          primaryUri.startsWith("mongodb+srv://") ? "SRV" : "standard",
        );
      } catch (primaryError) {
        console.error("Primary MongoDB connection failed:", {
          name: primaryError?.name,
          message: primaryError?.message,
        });

        /*
        |--------------------------------------------------------------------------
        | TRY STANDARD CONNECTION STRING IF SRV DNS FAILED
        |--------------------------------------------------------------------------
        */

        if (isSrvDnsError(primaryError) && standardUri) {
          console.warn(
            "MongoDB SRV DNS failed. Trying MONGODB_URI_STANDARD...",
          );

          try {
            return await connectUsingUri(standardUri, "standard fallback");
          } catch (fallbackError) {
            console.error("Standard MongoDB connection also failed:", {
              name: fallbackError?.name,
              message: fallbackError?.message,
            });

            throw fallbackError;
          }
        }

        /*
        |--------------------------------------------------------------------------
        | BETTER ERROR FOR SRV FAILURE
        |--------------------------------------------------------------------------
        */

        if (isSrvDnsError(primaryError)) {
          throw new Error(
            [
              "MongoDB SRV DNS lookup failed.",
              "",
              `Original error: ${primaryError.message}`,
              "",
              "Your application is using a mongodb+srv:// connection string.",
              "The DNS server/network is refusing or unable to resolve MongoDB SRV records.",
              "",
              "Fix options:",
              "1. Change Windows DNS to 1.1.1.1 and 8.8.8.8.",
              "2. Add MONGODB_DNS_SERVERS=1.1.1.1,8.8.8.8 to local .env.",
              "3. Use a MongoDB Atlas STANDARD mongodb:// connection string in MONGODB_URI_STANDARD.",
            ].join("\n"),
          );
        }

        throw primaryError;
      }
    })();
  }

  /*
  |--------------------------------------------------------------------------
  | WAIT FOR CONNECTION
  |--------------------------------------------------------------------------
  */

  try {
    cached.conn = await cached.promise;

    return cached.conn;
  } catch (error) {
    /*
    |--------------------------------------------------------------------------
    | CRITICAL
    |--------------------------------------------------------------------------
    |
    | Never keep a rejected promise cached.
    |
    | Otherwise Vercel/nodemon may continue using a permanently failed
    | MongoDB connection.
    |
    */

    cached.conn = null;
    cached.promise = null;

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| DISCONNECT
|--------------------------------------------------------------------------
|
| Mostly useful for tests/shutdown.
|
*/

export async function disconnectDB() {
  try {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }

    cached.conn = null;
    cached.promise = null;

    console.log("MongoDB disconnected");
  } catch (error) {
    console.error("MongoDB disconnect error:", error?.message);
  }
}
