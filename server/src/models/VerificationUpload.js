import mongoose from "mongoose";

import { VERIFICATION_DOCUMENT_TYPES } from "../constants/statuses.js";

const verificationUploadSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    key: { type: String, required: true, select: false, immutable: true },
    sha256: { type: String, required: true, select: false, immutable: true },
    mimeType: {
      type: String,
      enum: VERIFICATION_DOCUMENT_TYPES,
      required: true,
      immutable: true,
    },
    size: {
      type: Number,
      min: 16,
      max: 4 * 1024 * 1024,
      required: true,
      immutable: true,
    },
    scannedAt: { type: Date, required: true, immutable: true },
    acknowledgedAt: { type: Date, required: true, immutable: true },
    privacyNoticeVersion: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    uploadedAt: { type: Date, required: true, immutable: true },
    attachedRecordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VerificationRecord",
      default: null,
    },
    purgeAt: { type: Date, required: true },
    deletingAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

verificationUploadSchema.index(
  { ownerId: 1, uploadedAt: -1 },
  { name: "verification_upload_owner" },
);
verificationUploadSchema.index(
  { purgeAt: 1, deletingAt: 1 },
  { name: "verification_upload_purge_queue" },
);
verificationUploadSchema.index(
  { key: 1 },
  { name: "verification_upload_key_unique", unique: true },
);

export const VerificationUpload =
  mongoose.models.VerificationUpload ||
  mongoose.model("VerificationUpload", verificationUploadSchema);
