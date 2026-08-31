import fs from "fs";
import path from "path";
import { pipeline } from "node:stream/promises";

import Document from "../models/Document.js";
import Student from "../models/Student.js";

import { ApiError } from "../utils/ApiError.js";

import { asyncHandler } from "../utils/asyncHandler.js";

import { logActivity } from "../services/activityService.js";

import {
  uploadGridFile,
  deleteGridFile,
  gridFileExists,
  openGridDownloadStream,
} from "../services/fileStorageService.js";

import {
  notifyUsers,
  targetStudentUserIds,
} from "../services/notificationService.js";

/* =========================================================
   HELPERS
========================================================= */

const arr = (value) => {
  if (value === undefined || value === null || value === "") {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

const parseTags = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

/**
 * MongoDB filtering used by Student document list.
 */
async function studentFilter(user) {
  if (user.role !== "STUDENT") {
    return {};
  }

  const student = await Student.findOne({
    userId: user._id,
  });

  if (!student) {
    // Guarantees no documents.
    return {
      _id: null,
    };
  }

  return {
    isPublished: true,

    publishDate: {
      $lte: new Date(),
    },

    $or: [
      {
        targetType: "ALL",
      },

      {
        targetType: "BATCH",
        targetBatches: student.batchId,
      },
    ],
  };
}

/**
 * Validate direct Student access.
 */
async function checkStudentAccess(document, user) {
  if (user.role !== "STUDENT") {
    return;
  }

  const student = await Student.findOne({
    userId: user._id,
  });

  if (!student) {
    throw new ApiError(
      403,
      "Student profile not found",
      "STUDENT_PROFILE_NOT_FOUND",
    );
  }

  if (!document.isPublished) {
    throw new ApiError(403, "Document is not published", "FORBIDDEN");
  }

  if (document.publishDate && new Date(document.publishDate) > new Date()) {
    throw new ApiError(403, "Document is not available yet", "FORBIDDEN");
  }

  if (document.targetType === "BATCH") {
    const allowed = document.targetBatches
      .map((batch) => String(batch?._id || batch))
      .includes(String(student.batchId));

    if (!allowed) {
      throw new ApiError(403, "You cannot access this document", "FORBIDDEN");
    }
  }
}

/* =========================================================
   LIST DOCUMENTS
========================================================= */

export const listDocuments = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));

  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));

  const filter = await studentFilter(req.user);

  if (req.query.category) {
    filter.categoryId = req.query.category;
  }

  const search = String(req.query.search || "").trim();

  if (search) {
    filter.$and = [
      ...(filter.$and || []),

      {
        $or: [
          {
            title: {
              $regex: search,
              $options: "i",
            },
          },

          {
            description: {
              $regex: search,
              $options: "i",
            },
          },

          {
            tags: {
              $regex: search,
              $options: "i",
            },
          },
        ],
      },
    ];
  }

  const [data, total] = await Promise.all([
    Document.find(filter)
      .populate("categoryId", "name")
      .populate("targetBatches", "batchName")
      .populate("uploadedBy", "name")
      .sort({
        publishDate: -1,
        createdAt: -1,
      })
      .skip((page - 1) * limit)
      .limit(limit),

    Document.countDocuments(filter),
  ]);

  return res.json({
    success: true,

    data,

    pagination: {
      page,
      limit,
      total,

      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});

/* =========================================================
   GET DOCUMENT
========================================================= */

export const getDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id)
    .populate("categoryId", "name")
    .populate("targetBatches", "batchName")
    .populate("uploadedBy", "name");

  if (!document) {
    throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  }

  await checkStudentAccess(document, req.user);

  return res.json({
    success: true,
    data: document,
  });
});

/* =========================================================
   CREATE / UPLOAD DOCUMENT
========================================================= */

export const createDocument = asyncHandler(async (req, res) => {
  console.log("DOCUMENT UPLOAD REQUEST", {
    contentType: req.headers["content-type"],
    hasFile: !!req.file,
    fileName: req.file?.originalname,
    fileSize: req.file?.size,
  });

  if (!req.file) {
    throw new ApiError(
      400,
      "Document file was not received by the server. Please select the file again.",
      "DOCUMENT_FILE_REQUIRED",
    );
  }

  const title = String(req.body.title || "").trim();

  if (!title) {
    throw new ApiError(400, "Document title is required", "VALIDATION_ERROR");
  }

  if (!req.body.categoryId) {
    throw new ApiError(
      400,
      "Document category is required",
      "VALIDATION_ERROR",
    );
  }

  const targetType = req.body.targetType === "BATCH" ? "BATCH" : "ALL";

  const targetBatches =
    targetType === "BATCH" ? arr(req.body.targetBatches) : [];

  if (targetType === "BATCH" && targetBatches.length === 0) {
    throw new ApiError(
      400,
      "Select at least one target batch",
      "VALIDATION_ERROR",
    );
  }

  let gridFile = null;
  let document = null;

  /* -----------------------------------------------------
       STEP 1 - SAVE PHYSICAL FILE
    ----------------------------------------------------- */

  try {
    gridFile = await uploadGridFile(req.file, {
      uploadedBy: String(req.user._id),

      title,

      categoryId: String(req.body.categoryId),
    });
  } catch (error) {
    console.error("GridFS upload failed:", error);

    throw new ApiError(
      500,
      `File storage failed: ${error?.message || "Unknown GridFS error"}`,
      "FILE_STORAGE_ERROR",
    );
  }

  /* -----------------------------------------------------
       STEP 2 - SAVE DOCUMENT METADATA

       If this part fails, remove the GridFS file.
    ----------------------------------------------------- */

  try {
    document = await Document.create({
      title,

      description: String(req.body.description || "").trim(),

      categoryId: req.body.categoryId,

      originalFileName: req.file.originalname,

      storedFileName: gridFile.filename || req.file.originalname,

      filePath: null,

      gridFsFileId: gridFile.id,

      storageType: "GRIDFS",

      mimeType: req.file.mimetype,

      fileSize: req.file.size,

      version: String(req.body.version || "1.0").trim(),

      targetType,

      targetBatches,

      isPublished: String(req.body.isPublished) !== "false",

      publishDate: req.body.publishDate
        ? new Date(req.body.publishDate)
        : new Date(),

      uploadedBy: req.user._id,

      tags: parseTags(req.body.tags),

      downloadCount: 0,
    });
  } catch (error) {
    try {
      await deleteGridFile(gridFile.id);
    } catch (cleanupError) {
      console.error("GridFS cleanup failed:", cleanupError);
    }

    throw error;
  }

  /*
   * IMPORTANT:
   *
   * From this point onward we DO NOT delete
   * the GridFS file if notification/logging
   * fails.
   *
   * The document has already been saved
   * successfully.
   */

  try {
    await logActivity(req, {
      action: "UPLOAD_DOCUMENT",

      module: "DOCUMENTS",

      description: `Uploaded document ${document.title}`,

      entityType: "Document",

      entityId: document._id,
    });
  } catch (error) {
    console.warn("Activity logging failed after upload:", error.message);
  }

  try {
    const userIds = await targetStudentUserIds(
      document.targetType,
      document.targetBatches,
    );

    if (Array.isArray(userIds) && userIds.length > 0) {
      await notifyUsers(userIds, {
        title: "New training document",

        message: document.title,

        type: "DOCUMENT",

        referenceType: "Document",

        referenceId: document._id,
      });
    }
  } catch (error) {
    /*
     * Notification failure must NOT cause
     * a successful file upload to fail.
     */
    console.warn("Document notification failed:", error.message);
  }

  return res.status(201).json({
    success: true,

    message: "Document uploaded successfully",

    data: document,
  });
});

/* =========================================================
   UPDATE DOCUMENT
========================================================= */

export const updateDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id);

  if (!document) {
    throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  }

  const editableFields = [
    "title",
    "description",
    "categoryId",
    "version",
    "targetType",
  ];

  for (const field of editableFields) {
    if (req.body[field] !== undefined) {
      document[field] = req.body[field];
    }
  }

  if (req.body.publishDate) {
    document.publishDate = new Date(req.body.publishDate);
  }

  if (req.body.targetType === "ALL") {
    document.targetBatches = [];
  } else if (req.body.targetBatches !== undefined) {
    document.targetBatches = arr(req.body.targetBatches);
  }

  if (document.targetType === "BATCH" && document.targetBatches.length === 0) {
    throw new ApiError(
      400,
      "Select at least one target batch",
      "VALIDATION_ERROR",
    );
  }

  if (req.body.tags !== undefined) {
    document.tags = parseTags(req.body.tags);
  }

  if (req.body.isPublished !== undefined) {
    document.isPublished = String(req.body.isPublished) !== "false";
  }

  const oldGridFsFileId = document.gridFsFileId;

  const oldFilePath = document.filePath;

  let newGridFile = null;

  /* -----------------------------------------------------
       NEW FILE PROVIDED
    ----------------------------------------------------- */

  if (req.file) {
    try {
      newGridFile = await uploadGridFile(req.file, {
        uploadedBy: String(req.user._id),

        title: document.title,

        documentId: String(document._id),
      });

      document.originalFileName = req.file.originalname;

      document.storedFileName = newGridFile.filename;

      document.gridFsFileId = newGridFile.id;

      document.storageType = "GRIDFS";

      document.filePath = null;

      document.mimeType = req.file.mimetype;

      document.fileSize = req.file.size;
    } catch (error) {
      console.error("Replacement upload failed:", error);

      throw new ApiError(
        500,
        `File replacement failed: ${error?.message || "Unknown storage error"}`,
        "FILE_STORAGE_ERROR",
      );
    }
  }

  /* -----------------------------------------------------
       SAVE CHANGES
    ----------------------------------------------------- */

  try {
    await document.save();
  } catch (error) {
    if (newGridFile?.id) {
      try {
        await deleteGridFile(newGridFile.id);
      } catch {
        // Ignore cleanup.
      }
    }

    throw error;
  }

  /* -----------------------------------------------------
       DELETE PREVIOUS FILE AFTER SAVE
    ----------------------------------------------------- */

  if (req.file) {
    if (
      oldGridFsFileId &&
      String(oldGridFsFileId) !== String(newGridFile?.id)
    ) {
      try {
        await deleteGridFile(oldGridFsFileId);
      } catch (error) {
        console.warn("Old GridFS file cleanup failed:", error.message);
      }
    }

    if (oldFilePath) {
      try {
        const resolved = path.resolve(oldFilePath);

        if (fs.existsSync(resolved)) {
          fs.unlinkSync(resolved);
        }
      } catch (error) {
        console.warn("Old local file cleanup failed:", error.message);
      }
    }
  }

  await logActivity(req, {
    action: "UPDATE_DOCUMENT",

    module: "DOCUMENTS",

    description: `Updated document ${document.title}`,

    entityType: "Document",

    entityId: document._id,
  });

  return res.json({
    success: true,

    message: "Document updated successfully",

    data: document,
  });
});

/* =========================================================
   DELETE DOCUMENT
========================================================= */

export const deleteDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id);

  if (!document) {
    throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  }

  const gridId = document.gridFsFileId;

  const oldPath = document.filePath;

  const id = document._id;

  const title = document.title;

  await Document.deleteOne({
    _id: id,
  });

  if (gridId) {
    try {
      await deleteGridFile(gridId);
    } catch (error) {
      console.warn("GridFS file deletion failed:", error.message);
    }
  }

  if (oldPath) {
    try {
      const resolved = path.resolve(oldPath);

      if (fs.existsSync(resolved)) {
        fs.unlinkSync(resolved);
      }
    } catch (error) {
      console.warn("Local file deletion failed:", error.message);
    }
  }

  await logActivity(req, {
    action: "DELETE_DOCUMENT",

    module: "DOCUMENTS",

    description: `Deleted document ${title}`,

    entityType: "Document",

    entityId: id,
  });

  return res.json({
    success: true,

    message: "Document deleted successfully",
  });
});

/* =========================================================
   DOWNLOAD DOCUMENT
========================================================= */

export const downloadDocument = asyncHandler(async (req, res) => {
  const document = await Document.findById(req.params.id);

  if (!document) {
    throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  }

  await checkStudentAccess(document, req.user);

  /* -----------------------------------------------------
       GRIDFS
    ----------------------------------------------------- */

  if (document.gridFsFileId) {
    const exists = await gridFileExists(document.gridFsFileId);

    if (!exists) {
      throw new ApiError(
        404,
        "Document file is missing. Please re-upload this document.",
        "FILE_NOT_FOUND",
      );
    }

    const originalName =
      document.originalFileName || document.title || "document";

    const safeName = originalName.replace(/["\\\r\n]/g, "_");

    res.setHeader(
      "Content-Type",
      document.mimeType || "application/octet-stream",
    );

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(
        originalName,
      )}`,
    );

    const stream = openGridDownloadStream(document.gridFsFileId);

    try {
      await pipeline(stream, res);
    } catch (error) {
      console.error("GridFS download stream failed:", error);

      throw error;
    }

    /*
     * Update download counter after
     * successful stream.
     */
    try {
      await Document.updateOne(
        {
          _id: document._id,
        },
        {
          $inc: {
            downloadCount: 1,
          },
        },
      );

      await logActivity(req, {
        action: "DOWNLOAD_DOCUMENT",

        module: "DOCUMENTS",

        description: `Downloaded ${document.title}`,

        entityType: "Document",

        entityId: document._id,
      });
    } catch (error) {
      console.warn("Download logging failed:", error.message);
    }

    return;
  }

  /* -----------------------------------------------------
       OLD LOCAL FILE FALLBACK
    ----------------------------------------------------- */

  if (document.filePath) {
    const resolved = path.resolve(document.filePath);

    if (fs.existsSync(resolved)) {
      await Document.updateOne(
        {
          _id: document._id,
        },
        {
          $inc: {
            downloadCount: 1,
          },
        },
      );

      return res.download(
        resolved,
        document.originalFileName || document.title || "document",
      );
    }
  }

  throw new ApiError(
    404,
    "Document file is missing. Delete this old record and upload the file again.",
    "FILE_NOT_FOUND",
  );
});

/* =========================================================
   PUBLISH / UNPUBLISH
========================================================= */

export const publishDocument = asyncHandler(async (req, res) => {
  if (req.body.isPublished === undefined) {
    throw new ApiError(
      400,
      "Publication status is required",
      "VALIDATION_ERROR",
    );
  }

  const isPublished =
    req.body.isPublished === true || String(req.body.isPublished) === "true";

  const document = await Document.findByIdAndUpdate(
    req.params.id,
    {
      isPublished,
    },
    {
      new: true,
      runValidators: true,
    },
  );

  if (!document) {
    throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  }

  await logActivity(req, {
    action: isPublished ? "PUBLISH_DOCUMENT" : "UNPUBLISH_DOCUMENT",

    module: "DOCUMENTS",

    description: `${
      isPublished ? "Published" : "Unpublished"
    } document ${document.title}`,

    entityType: "Document",

    entityId: document._id,
  });

  return res.json({
    success: true,

    message: isPublished
      ? "Document published successfully"
      : "Document unpublished successfully",

    data: document,
  });
});
