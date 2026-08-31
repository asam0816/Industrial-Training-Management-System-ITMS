import mongoose from "mongoose";

/**
 * Return GridFS bucket using the SAME MongoDB driver
 * that Mongoose is currently connected with.
 */
function getBucket() {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("MongoDB connection is not available");
  }

  return new mongoose.mongo.GridFSBucket(db, {
    bucketName: "documents",
  });
}

function toObjectId(id) {
  if (!id) {
    throw new Error("GridFS file ID is required");
  }

  return new mongoose.mongo.ObjectId(String(id));
}

/**
 * Upload Multer memoryStorage file to MongoDB GridFS.
 */
export function uploadGridFile(file, metadata = {}) {
  return new Promise((resolve, reject) => {
    if (!file) {
      return reject(new Error("Upload file is missing"));
    }

    if (!file.buffer) {
      return reject(
        new Error("File buffer is missing. Multer must use memoryStorage()."),
      );
    }

    const bucket = getBucket();

    const filename = file.originalname || `document-${Date.now()}`;

    const uploadStream = bucket.openUploadStream(filename, {
      contentType: file.mimetype || "application/octet-stream",

      metadata: {
        originalFileName: filename,
        uploadedAt: new Date(),
        ...metadata,
      },
    });

    uploadStream.on("error", (error) => {
      reject(error);
    });

    uploadStream.on("finish", () => {
      resolve({
        id: uploadStream.id,
        filename: uploadStream.filename,
      });
    });

    uploadStream.end(file.buffer);
  });
}

/**
 * Check whether GridFS file actually exists.
 */
export async function gridFileExists(id) {
  if (!id) {
    return false;
  }

  try {
    const bucket = getBucket();

    const files = await bucket
      .find({
        _id: toObjectId(id),
      })
      .limit(1)
      .toArray();

    return files.length > 0;
  } catch (error) {
    console.error("GridFS existence check failed:", error.message);

    return false;
  }
}

/**
 * Return GridFS download stream.
 */
export function openGridDownloadStream(id) {
  const bucket = getBucket();

  return bucket.openDownloadStream(toObjectId(id));
}

/**
 * Delete file from GridFS.
 */
export async function deleteGridFile(id) {
  if (!id) {
    return;
  }

  try {
    const bucket = getBucket();

    await bucket.delete(toObjectId(id));
  } catch (error) {
    const message = String(error?.message || "");

    // File already missing.
    if (
      error?.code === 26 ||
      message.includes("FileNotFound") ||
      message.includes("File not found")
    ) {
      return;
    }

    throw error;
  }
}
