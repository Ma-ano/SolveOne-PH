import mongoose from "mongoose";

import { SESSION_PLATFORMS } from "../constants/statuses.js";

const refreshSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, immutable: true },
    familyId: { type: String, required: true, immutable: true },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    tokenHash: { type: String, required: true, unique: true, select: false },
    deviceName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Unknown device",
    },
    platform: {
      type: String,
      enum: SESSION_PLATFORMS,
      default: "unknown",
      required: true,
    },
    ipHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

refreshSessionSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "refresh_session_user_created" },
);
refreshSessionSchema.index(
  { familyId: 1, revokedAt: 1 },
  { name: "refresh_session_family_active" },
);
refreshSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "refresh_session_ttl" },
);

export const RefreshSession =
  mongoose.models.RefreshSession ||
  mongoose.model("RefreshSession", refreshSessionSchema);
