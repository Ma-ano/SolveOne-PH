import mongoose from "mongoose";

import {
  DATA_SUBJECT_REQUEST_STATUSES,
  DATA_SUBJECT_REQUEST_TYPES,
} from "../constants/statuses.js";

const dataSubjectRequestSchema = new mongoose.Schema(
  {
    requesterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    requestType: {
      type: String,
      enum: DATA_SUBJECT_REQUEST_TYPES,
      required: true,
      immutable: true,
    },
    details: {
      type: String,
      trim: true,
      minlength: 20,
      maxlength: 2000,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: DATA_SUBJECT_REQUEST_STATUSES,
      default: "submitted",
      required: true,
    },
    privacyPolicyVersion: {
      type: String,
      trim: true,
      maxlength: 50,
      required: true,
      immutable: true,
    },
    assignedAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      select: false,
    },
    claimedAt: { type: Date, default: null },
    resolutionSummary: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      select: false,
    },
    resolvedAt: { type: Date, default: null },
    activeKey: { type: String, select: false },
  },
  { timestamps: true, minimize: false },
);

dataSubjectRequestSchema.index(
  { activeKey: 1 },
  {
    name: "data_subject_request_active_unique",
    unique: true,
    partialFilterExpression: { activeKey: { $type: "string" } },
  },
);
dataSubjectRequestSchema.index(
  { requesterId: 1, createdAt: -1, _id: -1 },
  { name: "data_subject_request_owner_created" },
);
dataSubjectRequestSchema.index(
  { status: 1, requestType: 1, createdAt: -1, _id: -1 },
  { name: "data_subject_request_admin_queue" },
);

export const DataSubjectRequest =
  mongoose.models.DataSubjectRequest ||
  mongoose.model("DataSubjectRequest", dataSubjectRequestSchema);
