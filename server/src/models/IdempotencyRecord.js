import mongoose from "mongoose";

const idempotencyRecordSchema = new mongoose.Schema(
  {
    principalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    operation: {
      type: String,
      required: true,
      maxlength: 100,
      immutable: true,
    },
    keyHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
      select: false,
    },
    requestHash: {
      type: String,
      required: true,
      minlength: 64,
      maxlength: 64,
      immutable: true,
      select: false,
    },
    state: {
      type: String,
      enum: ["in_progress", "completed"],
      default: "in_progress",
      required: true,
    },
    responseStatus: { type: Number, min: 200, max: 299, default: null },
    responseBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, minimize: false },
);

idempotencyRecordSchema.index(
  { principalId: 1, operation: 1, keyHash: 1 },
  { name: "idempotency_scope_unique", unique: true },
);
idempotencyRecordSchema.index(
  { expiresAt: 1 },
  { name: "idempotency_ttl", expireAfterSeconds: 0 },
);

export const IdempotencyRecord =
  mongoose.models.IdempotencyRecord ||
  mongoose.model("IdempotencyRecord", idempotencyRecordSchema);
