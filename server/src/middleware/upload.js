import multer from "multer";
import path from "path";
import fs from "fs";
import os from "os";
import { v4 as uuid } from "uuid";
import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

// Vercel serverless filesystem is read-only except /tmp
const isVercel = !!process.env.VERCEL;

// Use /tmp on Vercel, otherwise use your configured uploadDir
const dir = isVercel
  ? path.join(os.tmpdir(), "uploads")
  : path.resolve(process.cwd(), env.uploadDir);

// Create folder safely
try {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
} catch (e) {
  // If folder creation fails, fail fast with a clear error
  throw new Error(`Failed to create upload directory "${dir}": ${e.message}`);
}

const allowed = new Map([
  ["application/pdf", ".pdf"],
  ["application/msword", ".doc"],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".docx",
  ],
  ["application/vnd.ms-excel", ".xls"],
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xlsx",
  ],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dir),
  filename: (_req, file, cb) => {
    const ext =
      allowed.get(file.mimetype) ||
      path.extname(file.originalname).toLowerCase();

    cb(null, `${uuid()}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: env.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!allowed.has(file.mimetype)) {
      return cb(new ApiError(400, "Invalid file type", "INVALID_FILE_TYPE"));
    }
    cb(null, true);
  },
});
