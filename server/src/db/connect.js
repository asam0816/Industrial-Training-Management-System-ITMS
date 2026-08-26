import mongoose from "mongoose";
import { env } from "../config/env.js";

let cached = global._mongoose;
if (!cached) cached = global._mongoose = { conn: null, promise: null };

export async function connectDB() {
  if (cached.conn) return cached.conn;

  if (!cached.promise) {
    cached.promise = mongoose
      .connect(env.mongoUri, { serverSelectionTimeoutMS: 20000 })
      .then((m) => m)
      .catch((err) => {
        if (String(err?.message || "").includes("querySrv")) {
          throw new Error(
            "MongoDB SRV DNS lookup failed (mongodb+srv). Fix by using MongoDB Atlas STANDARD connection string (mongodb://...) or change your DNS network.",
          );
        }
        throw err;
      });
  }

  cached.conn = await cached.promise;
  return cached.conn;
}
