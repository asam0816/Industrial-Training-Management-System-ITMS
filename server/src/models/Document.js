import mongoose from "mongoose";

const documentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    description: {
      type: String,
      default: "",
    },

    categoryId: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "DocumentCategory",

      required: true,

      index: true,
    },

    originalFileName: {
      type: String,
      required: true,
    },

    storedFileName: {
      type: String,
    },

    /**
     * Old local disk support.
     */
    filePath: {
      type: String,
      default: null,
    },

    /**
     * New permanent GridFS storage.
     */
    gridFsFileId: {
      type: mongoose.Schema.Types.ObjectId,

      default: null,

      index: true,
    },

    storageType: {
      type: String,

      enum: ["LOCAL", "GRIDFS"],

      default: "GRIDFS",
    },

    mimeType: {
      type: String,
    },

    fileSize: {
      type: Number,
      default: 0,
    },

    version: {
      type: String,
      default: "1.0",
    },

    targetType: {
      type: String,

      enum: ["ALL", "BATCH"],

      default: "ALL",
    },

    targetBatches: [
      {
        type: mongoose.Schema.Types.ObjectId,

        ref: "Batch",

        index: true,
      },
    ],

    isPublished: {
      type: Boolean,
      default: true,
    },

    publishDate: {
      type: Date,
      default: Date.now,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },

    downloadCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    tags: [
      {
        type: String,
        trim: true,
      },
    ],
  },
  {
    timestamps: true,
  },
);

documentSchema.index({
  title: "text",
  description: "text",
  tags: "text",
});

export default mongoose.model("Document", documentSchema);
