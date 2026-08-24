import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";

// MongoDB Atlas uses DNS SRV records.
// Explicit DNS servers avoid Windows/ISP DNS issues with Node.js.
if (env.mongoUri.startsWith("mongodb+srv://")) {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
}

export async function connectDB() {
  try {
    mongoose.set("strictQuery", true);

    await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 15000,
    });

    console.log("MongoDB connected successfully");
  } catch (error) {
    console.error("MongoDB connection failed:");

    if (process.env.NODE_ENV === "development") {
      console.error(error.message);
    }

    throw error;
  }
}
