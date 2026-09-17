import mongoose from "mongoose";

const evidenceFileSchema = new mongoose.Schema(
  {
    id: { type: String, match: /^[0-9a-fA-F]{24}$/, required: true },
    name: { type: String, trim: true, maxlength: 120, required: true },
    mimeType: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
      required: true,
    },
    size: { type: Number, min: 8, max: 5 * 1024 * 1024, required: true },
  },
  { _id: false },
);

const completionEvidenceSchema = new mongoose.Schema(
  {
    offerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpOffer",
      required: true,
      immutable: true,
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    note: {
      type: String,
      trim: true,
      minlength: 10,
      maxlength: 2000,
      required: true,
    },
    files: {
      type: [evidenceFileSchema],
      default: [],
      validate: {
        validator: (files) => files.length <= 4,
        message: "At most four private proof files are allowed",
      },
    },
    actualMinutes: { type: Number, min: 1, max: 10080, default: null },
    submittedAt: { type: Date, required: true, immutable: true },
    confirmedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    confirmedAt: { type: Date, default: null },
    disputedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    disputedAt: { type: Date, default: null },
    disputeReason: { type: String, trim: true, maxlength: 2000, default: null },
  },
  { timestamps: true, minimize: false },
);

completionEvidenceSchema.index(
  { offerId: 1 },
  { name: "completion_evidence_offer_unique", unique: true },
);

export const CompletionEvidence =
  mongoose.models.CompletionEvidence ||
  mongoose.model("CompletionEvidence", completionEvidenceSchema);
