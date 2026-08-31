import multer from "multer";
import path from "path";

import { env } from "../config/env.js";
import { ApiError } from "../utils/ApiError.js";

/**
 * GridFS receives files from memory.
 *
 * Do not use diskStorage because Vercel's local
 * filesystem is temporary.
 */
const storage = multer.memoryStorage();

const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx"]);

const allowedMimeTypes = new Set([
  "application/pdf",

  "application/msword",

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "application/vnd.ms-excel",

  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  // Some browsers may use this.
  "application/octet-stream",
]);

export const upload = multer({
  storage,

  limits: {
    fileSize: Number(env.maxFileSizeMb || 10) * 1024 * 1024,
  },

  fileFilter: (_req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();

    if (!allowedExtensions.has(extension)) {
      return cb(
        new ApiError(
          400,
          "Invalid file extension. Only PDF, Word and Excel files are allowed.",
          "INVALID_FILE_TYPE",
        ),
      );
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
      return cb(
        new ApiError(400, "Invalid document file type.", "INVALID_FILE_TYPE"),
      );
    }

    return cb(null, true);
  },
});
