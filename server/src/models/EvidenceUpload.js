import mongoose from "mongoose";

const evidenceUploadSchema = new mongoose.Schema(
  {
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpOffer",
      required: true,
      immutable: true,
    },
    helperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    key: { type: String, required: true, select: false, immutable: true },
    name: { type: String, trim: true, maxlength: 120, required: true },
    mimeType: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
      required: true,
    },
    size: { type: Number, min: 8, max: 5 * 1024 * 1024, required: true },
    uploadedAt: { type: Date, required: true, immutable: true },
    attachedAt: { type: Date, default: null },
    deletingAt: { type: Date, default: null },
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

evidenceUploadSchema.index(
  { offerId: 1, helperId: 1, uploadedAt: -1 },
  { name: "evidence_upload_owner" },
);
evidenceUploadSchema.index(
  { expiresAt: 1, attachedAt: 1 },
  { name: "evidence_upload_cleanup_queue" },
);

export const EvidenceUpload =
  mongoose.models.EvidenceUpload ||
  mongoose.model("EvidenceUpload", evidenceUploadSchema);
