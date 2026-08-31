import { Router } from "express";

import { authenticate } from "../middleware/auth.js";

import { authorize } from "../middleware/authorize.js";

import { upload } from "../middleware/upload.js";

import {
  listDocuments,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument,
  downloadDocument,
  publishDocument,
} from "../controllers/documentController.js";

const router = Router();

router.use(authenticate);

/**
 * List documents
 */
router.get("/", listDocuments);

/**
 * Upload document
 *
 * IMPORTANT:
 * "file" must match:
 *
 * formData.append("file", file)
 */
router.post(
  "/",
  authorize("ADMIN", "COORDINATOR"),
  upload.single("file"),
  createDocument,
);

/**
 * Download
 *
 * Must stay before /:id.
 */
router.get("/:id/download", downloadDocument);

router.get("/:id", getDocument);

/**
 * Update / optionally replace file.
 */
router.patch(
  "/:id",
  authorize("ADMIN", "COORDINATOR"),
  upload.single("file"),
  updateDocument,
);

router.delete("/:id", authorize("ADMIN", "COORDINATOR"), deleteDocument);

router.patch(
  "/:id/publish",
  authorize("ADMIN", "COORDINATOR"),
  publishDocument,
);

export default router;
