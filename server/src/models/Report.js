import mongoose from "mongoose";

import { REPORT_STATUSES, REPORT_TARGET_TYPES } from "../constants/statuses.js";

const reportSchema = new mongoose.Schema(
  {
    reporterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    targetType: {
      type: String,
      enum: REPORT_TARGET_TYPES,
      required: true,
      immutable: true,
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    reportedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      immutable: true,
      select: false,
    },
    reason: { type: String, trim: true, maxlength: 100, required: true },
    description: { type: String, trim: true, maxlength: 1000, default: null },
    status: {
      type: String,
      enum: REPORT_STATUSES,
      default: "open",
      required: true,
    },
    assignedModerator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    claimedAt: { type: Date, default: null },
    claimExpiresAt: { type: Date, default: null },
    resolution: { type: String, trim: true, maxlength: 2000, default: null },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: { type: Date, default: null },
    activeKey: { type: String, select: false },
  },
  { timestamps: true, minimize: false },
);

reportSchema.index(
  { activeKey: 1 },
  {
    name: "report_active_unique",
    unique: true,
    partialFilterExpression: { activeKey: { $type: "string" } },
  },
);
reportSchema.index(
  { status: 1, createdAt: 1, _id: 1 },
  { name: "report_moderation_queue" },
);
reportSchema.index(
  { status: 1, targetType: 1, createdAt: 1, _id: 1 },
  { name: "report_moderation_target_queue" },
);
reportSchema.index(
  { assignedModerator: 1, status: 1, claimExpiresAt: 1 },
  { name: "report_moderator_claims" },
);

export const Report =
  mongoose.models.Report || mongoose.model("Report", reportSchema);
