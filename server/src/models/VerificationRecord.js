import mongoose from "mongoose";

import {
  VERIFICATION_DOCUMENT_TYPES,
  VERIFICATION_RECORD_STATUSES,
} from "../constants/statuses.js";

const submittedDocumentSchema = new mongoose.Schema(
  {
    uploadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "VerificationUpload",
      required: true,
      immutable: true,
    },
    mimeType: {
      type: String,
      enum: VERIFICATION_DOCUMENT_TYPES,
      required: true,
      immutable: true,
    },
    size: { type: Number, required: true, immutable: true },
  },
  { _id: false, minimize: false },
);

const verificationRecordSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    type: {
      type: String,
      enum: ["identity"],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: VERIFICATION_RECORD_STATUSES,
      default: "pending",
      required: true,
    },
    activeKey: { type: String, select: false },
    documents: {
      type: [submittedDocumentSchema],
      required: true,
      validate: {
        validator(documents) {
          return (
            documents.length >= 1 &&
            documents.length <= 2 &&
            new Set(documents.map((item) => String(item.uploadId))).size ===
              documents.length
          );
        },
        message: "Identity review requires one or two distinct documents",
      },
    },
    privacyNoticeVersion: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    acknowledgedAt: { type: Date, required: true, immutable: true },
    submittedAt: { type: Date, required: true, immutable: true },
    claimBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    claimExpiresAt: { type: Date, default: null },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    expiredAt: { type: Date, default: null },
    documentsPurgedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

verificationRecordSchema.index(
  { userId: 1, createdAt: -1, _id: -1 },
  { name: "verification_user_history" },
);
verificationRecordSchema.index(
  { status: 1, submittedAt: 1, _id: 1 },
  { name: "verification_review_queue" },
);
verificationRecordSchema.index(
  { activeKey: 1 },
  {
    name: "verification_active_user_unique",
    unique: true,
    partialFilterExpression: { activeKey: { $type: "string" } },
  },
);

export const VerificationRecord =
  mongoose.models.VerificationRecord ||
  mongoose.model("VerificationRecord", verificationRecordSchema);
