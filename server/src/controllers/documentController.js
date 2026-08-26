import fs from "fs";
import path from "path";
import Document from "../models/Document.js";
import Student from "../models/Student.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { logActivity } from "../services/activityService.js";
import {
  notifyUsers,
  targetStudentUserIds,
} from "../services/notificationService.js";
const arr = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
const tags = (v) =>
  Array.isArray(v)
    ? v
    : String(v || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
async function studentFilter(user) {
  if (user.role !== "STUDENT") return {};
  const s = await Student.findOne({ userId: user._id });
  if (!s) return { _id: null };
  return {
    isPublished: true,
    publishDate: { $lte: new Date() },
    $or: [
      { targetType: "ALL" },
      { targetType: "BATCH", targetBatches: s.batchId },
    ],
  };
}
export const listDocuments = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1)),
    limit = Math.min(100, Math.max(1, Number(req.query.limit || 10)));
  const f = await studentFilter(req.user);
  if (req.query.category) f.categoryId = req.query.category;
  if (req.query.search)
    f.$and = [
      ...(f.$and || []),
      {
        $or: [
          { title: { $regex: req.query.search, $options: "i" } },
          { description: { $regex: req.query.search, $options: "i" } },
          { tags: { $regex: req.query.search, $options: "i" } },
        ],
      },
    ];
  const [data, total] = await Promise.all([
    Document.find(f)
      .populate("categoryId", "name")
      .populate("targetBatches", "batchName")
      .populate("uploadedBy", "name")
      .sort({ publishDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Document.countDocuments(f),
  ]);
  res.json({
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
export const getDocument = asyncHandler(async (req, res) => {
  const d = await Document.findById(req.params.id)
    .populate("categoryId", "name")
    .populate("targetBatches", "batchName");
  if (!d) throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  if (req.user.role === "STUDENT") {
    const s = await Student.findOne({ userId: req.user._id });
    if (
      !d.isPublished ||
      (d.targetType === "BATCH" &&
        !d.targetBatches.some((b) => String(b._id || b) === String(s?.batchId)))
    )
      throw new ApiError(403, "You cannot access this document", "FORBIDDEN");
  }
  res.json({ success: true, data: d });
});
export const createDocument = asyncHandler(async (req, res) => {
  if (!req.file)
    throw new ApiError(400, "Document file is required", "VALIDATION_ERROR");
  const targetBatches = arr(req.body.targetBatches);
  if (req.body.targetType === "BATCH" && !targetBatches.length)
    throw new ApiError(
      400,
      "Select at least one target batch",
      "VALIDATION_ERROR",
    );
  const d = await Document.create({
    title: req.body.title,
    description: req.body.description,
    categoryId: req.body.categoryId,
    originalFileName: req.file.originalname,
    storedFileName: req.file.filename,
    filePath: req.file.path,
    mimeType: req.file.mimetype,
    fileSize: req.file.size,
    version: req.body.version || "1.0",
    targetType: req.body.targetType || "ALL",
    targetBatches,
    isPublished: String(req.body.isPublished) !== "false",
    publishDate: req.body.publishDate || new Date(),
    uploadedBy: req.user._id,
    tags: tags(req.body.tags),
  });
  await logActivity(req, {
    action: "UPLOAD_DOCUMENT",
    module: "DOCUMENTS",
    description: `Uploaded document ${d.title}`,
    entityType: "Document",
    entityId: d._id,
  });
  const ids = await targetStudentUserIds(d.targetType, d.targetBatches);
  await notifyUsers(ids, {
    title: "New training document",
    message: d.title,
    type: "DOCUMENT",
    referenceType: "Document",
    referenceId: d._id,
  });
  res
    .status(201)
    .json({
      success: true,
      message: "Document uploaded successfully",
      data: d,
    });
});
export const updateDocument = asyncHandler(async (req, res) => {
  const d = await Document.findById(req.params.id);
  if (!d) throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  for (const k of [
    "title",
    "description",
    "categoryId",
    "version",
    "targetType",
    "publishDate",
  ])
    if (req.body[k] !== undefined) d[k] = req.body[k];
  if (req.body.targetBatches !== undefined)
    d.targetBatches = arr(req.body.targetBatches);
  if (req.body.tags !== undefined) d.tags = tags(req.body.tags);
  if (req.body.isPublished !== undefined)
    d.isPublished = String(req.body.isPublished) !== "false";
  if (req.file) {
    if (d.filePath && fs.existsSync(d.filePath)) fs.unlinkSync(d.filePath);
    Object.assign(d, {
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      filePath: req.file.path,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
    });
  }
  await d.save();
  await logActivity(req, {
    action: "UPDATE_DOCUMENT",
    module: "DOCUMENTS",
    description: `Updated document ${d.title}`,
    entityType: "Document",
    entityId: d._id,
  });
  res.json({ success: true, message: "Document updated", data: d });
});
export const deleteDocument = asyncHandler(async (req, res) => {
  const d = await Document.findByIdAndDelete(req.params.id);
  if (!d) throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  if (d.filePath && fs.existsSync(d.filePath)) fs.unlinkSync(d.filePath);
  await logActivity(req, {
    action: "DELETE_DOCUMENT",
    module: "DOCUMENTS",
    description: `Deleted document ${d.title}`,
    entityType: "Document",
    entityId: d._id,
  });
  res.json({ success: true, message: "Document deleted" });
});
export const downloadDocument = asyncHandler(async (req, res) => {
  const d = await Document.findById(req.params.id);
  if (!d) throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  if (req.user.role === "STUDENT") {
    const s = await Student.findOne({ userId: req.user._id });
    if (
      !d.isPublished ||
      (d.targetType === "BATCH" &&
        !d.targetBatches.map(String).includes(String(s?.batchId)))
    )
      throw new ApiError(403, "You cannot access this document", "FORBIDDEN");
  }
  if (!d.filePath || !fs.existsSync(d.filePath))
    throw new ApiError(404, "Document file is missing", "FILE_NOT_FOUND");
  d.downloadCount += 1;
  await d.save();
  await logActivity(req, {
    action: "DOWNLOAD_DOCUMENT",
    module: "DOCUMENTS",
    description: `Downloaded ${d.title}`,
    entityType: "Document",
    entityId: d._id,
  });
  res.download(path.resolve(d.filePath), d.originalFileName);
});
export const publishDocument = asyncHandler(async (req, res) => {
  const d = await Document.findByIdAndUpdate(
    req.params.id,
    { isPublished: !!req.body.isPublished },
    { new: true },
  );
  if (!d) throw new ApiError(404, "Document not found", "DOCUMENT_NOT_FOUND");
  res.json({ success: true, message: "Publication status updated", data: d });
});
