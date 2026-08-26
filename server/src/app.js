import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import mongoose from "mongoose";

import { env } from "./config/env.js";
import { connectDB } from "./config/db.js";

import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import batchRoutes from "./routes/batchRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import questionRoutes from "./routes/questionRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import evaluationRoutes from "./routes/evaluationRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";

import { notFound, errorHandler } from "./middleware/error.js";

const app = express();

/* =========================================================
   TRUST PROXY
========================================================= */

app.set("trust proxy", 1);

/* =========================================================
   SECURITY
========================================================= */

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

/* =========================================================
   CORS
========================================================= */

const normalizeOrigin = (value) => {
  if (!value) return value;

  return value.trim().replace(/\/+$/, "");
};

const configuredClientUrls = Array.isArray(env.clientUrls)
  ? env.clientUrls
  : [];

const allowedOrigins = new Set(
  [
    ...configuredClientUrls,

    // Local development
    "http://localhost:3000",
    "http://localhost:5173",

    // Production frontend
    "https://itms-new.vercel.app",
  ]
    .map(normalizeOrigin)
    .filter(Boolean),
);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow tools/server-to-server requests with no Origin header
    if (!origin) {
      return callback(null, true);
    }

    const normalized = normalizeOrigin(origin);

    if (allowedOrigins.has(normalized)) {
      return callback(null, true);
    }

    console.error(`CORS blocked request from: ${origin}`);

    return callback(new Error(`CORS blocked: ${origin}`));
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],

  allowedHeaders: ["Content-Type", "Authorization"],

  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

/*
 * Express 5
 * Do not use:
 *
 * app.options("*", ...)
 *
 * Regex works correctly.
 */
app.options(/.*/, cors(corsOptions));

/* =========================================================
   BODY / COOKIE PARSING
========================================================= */

app.use(
  express.json({
    limit: "1mb",
  }),
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  }),
);

app.use(cookieParser());

/* =========================================================
   REQUEST LOGGING
========================================================= */

app.use(morgan(env.nodeEnv === "production" ? "combined" : "dev"));

/* =========================================================
   BASIC API HEALTH CHECK
   Does NOT require MongoDB
========================================================= */

app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "ITMS API is running",
    environment: env.nodeEnv,
    timestamp: new Date().toISOString(),
  });
});

/* =========================================================
   DATABASE HEALTH CHECK
========================================================= */

app.get("/api/health/db", async (req, res) => {
  try {
    await connectDB();

    return res.status(200).json({
      success: true,
      message: "MongoDB connected successfully",
      database: "connected",
      readyState: mongoose.connection.readyState,
      databaseName: mongoose.connection.name || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("MongoDB health check failed:", error);

    return res.status(503).json({
      success: false,
      message: "MongoDB connection failed",
      database: "disconnected",
      readyState: mongoose.connection.readyState,
      timestamp: new Date().toISOString(),
    });
  }
});

/* =========================================================
   DATABASE CONNECTION MIDDLEWARE

   IMPORTANT:
   This runs BEFORE all database-dependent routes.

   Therefore:
       request
         ↓
       connectDB()
         ↓
       MongoDB connected
         ↓
       route/controller
         ↓
       User.findOne(), Student.find(), etc.
========================================================= */

app.use(async (req, res, next) => {
  try {
    await connectDB();

    return next();
  } catch (error) {
    console.error("Database middleware connection error:", {
      name: error?.name,
      message: error?.message,
    });

    return res.status(503).json({
      success: false,
      message: "Database service is temporarily unavailable. Please try again.",
    });
  }
});

/* =========================================================
   API ROUTES
   These routes now run ONLY after MongoDB is connected
========================================================= */

app.use("/api/auth", authRoutes);

app.use("/api/users", userRoutes);

app.use("/api/students", studentRoutes);

app.use("/api/batches", batchRoutes);

app.use("/api/document-categories", categoryRoutes);

app.use("/api/documents", documentRoutes);

app.use("/api/announcements", announcementRoutes);

app.use("/api/questions", questionRoutes);

app.use("/api/notifications", notificationRoutes);

app.use("/api/dashboard", dashboardRoutes);

app.use("/api/evaluations", evaluationRoutes);

app.use("/api/activity-logs", activityRoutes);

app.use("/api/profile", profileRoutes);

app.use("/api/search", searchRoutes);

/* =========================================================
   404 HANDLER
========================================================= */

app.use(notFound);

/* =========================================================
   GLOBAL ERROR HANDLER
   MUST BE LAST
========================================================= */

app.use(errorHandler);

/* =========================================================
   EXPORT APP
========================================================= */

export default app;
