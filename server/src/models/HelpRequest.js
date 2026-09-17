import mongoose from "mongoose";

import {
  HELP_REQUEST_STATUSES,
  HELP_TYPES,
  REQUEST_SAFETY_FLAGS,
  REQUEST_URGENCIES,
  REQUEST_VISIBILITIES,
} from "../constants/statuses.js";

const needItemSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 100, default: "" },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    type: { type: String, enum: HELP_TYPES, required: true },
    quantity: { type: Number, min: 1, max: 10000, default: 1 },
    estimatedValueCentavos: { type: Number, min: 0, default: 0 },
    estimatedMinutes: {
      type: Number,
      min: 15,
      max: 10080,
      default: null,
    },
    solvedQuantity: { type: Number, min: 0, default: 0 },
    reservedQuantity: { type: Number, min: 0, default: 0 },
    solvedValueCentavos: { type: Number, min: 0, default: 0 },
    reservedValueCentavos: { type: Number, min: 0, default: 0 },
  },
  { minimize: false },
);

needItemSchema.pre("validate", function validateEstimatedTime() {
  if (
    !["skill", "time"].includes(this.type) &&
    this.estimatedMinutes !== null &&
    this.estimatedMinutes !== undefined
  ) {
    this.invalidate(
      "estimatedMinutes",
      "Only skill or time needs can estimate minutes",
    );
  }
});

const privateLocationSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "Philippines",
    },
    province: { type: String, trim: true, maxlength: 80, default: null },
    city: { type: String, trim: true, maxlength: 80, default: null },
    barangay: { type: String, trim: true, maxlength: 120, default: null },
  },
  { _id: false, minimize: false },
);

const publicLocationSchema = new mongoose.Schema(
  {
    province: { type: String, trim: true, maxlength: 80, default: null },
    city: { type: String, trim: true, maxlength: 80, default: null },
  },
  { _id: false, minimize: false },
);

const moderationSchema = new mongoose.Schema(
  {
    submittedAt: { type: Date, default: null },
    reviewerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    notes: { type: String, trim: true, maxlength: 1000, default: null },
  },
  { _id: false, minimize: false },
);

const helpRequestSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    title: { type: String, trim: true, maxlength: 120, default: "" },
    description: { type: String, trim: true, maxlength: 5000, default: "" },
    category: { type: String, trim: true, maxlength: 60, default: "" },
    helpTypes: { type: [{ type: String, enum: HELP_TYPES }], default: [] },
    visibility: {
      type: String,
      enum: REQUEST_VISIBILITIES,
      default: "public",
      required: true,
    },
    urgency: {
      type: String,
      enum: REQUEST_URGENCIES,
      default: "normal",
      required: true,
    },
    location: { type: privateLocationSchema, default: () => ({}) },
    publicLocation: { type: publicLocationSchema, default: () => ({}) },
    neededBy: { type: Date, default: null },
    estimatedValueCentavos: { type: Number, min: 0, default: 0 },
    currency: { type: String, enum: ["PHP"], default: "PHP", immutable: true },
    needItems: { type: [needItemSchema], default: [] },
    requiredSkills: {
      type: [{ type: String, trim: true, maxlength: 50 }],
      default: [],
    },
    status: {
      type: String,
      enum: HELP_REQUEST_STATUSES,
      default: "draft",
      required: true,
    },
    moderation: { type: moderationSchema, default: () => ({}) },
    verificationRequirements: {
      type: [{ type: String, trim: true, maxlength: 100 }],
      default: [],
    },
    safetyFlags: {
      type: [{ type: String, enum: REQUEST_SAFETY_FLAGS }],
      default: [],
      select: false,
    },
    publishedAt: { type: Date, default: null },
    solvedAt: { type: Date, default: null },
    offerActivityVersion: { type: Number, min: 0, default: 0, select: false },
  },
  { timestamps: true, minimize: false },
);

helpRequestSchema.index(
  { ownerId: 1, updatedAt: -1, _id: -1 },
  { name: "request_owner_updated" },
);
helpRequestSchema.index(
  { status: 1, visibility: 1, publishedAt: -1, _id: -1 },
  { name: "request_public_listing" },
);
helpRequestSchema.index(
  { status: 1, "moderation.submittedAt": 1, _id: 1 },
  { name: "request_moderation_queue" },
);
helpRequestSchema.index(
  { status: 1, category: 1, publishedAt: -1, _id: -1 },
  { name: "request_public_category" },
);
helpRequestSchema.index(
  { status: 1, helpTypes: 1, publishedAt: -1, _id: -1 },
  { name: "request_public_help_type" },
);
helpRequestSchema.index(
  { status: 1, urgency: 1, publishedAt: -1, _id: -1 },
  { name: "request_public_urgency" },
);
helpRequestSchema.index(
  { status: 1, visibility: 1, "publicLocation.province": 1, publishedAt: 1 },
  { name: "request_public_province_discovery" },
);
helpRequestSchema.index(
  { status: 1, visibility: 1, requiredSkills: 1, publishedAt: 1 },
  { name: "request_public_skill_discovery" },
);

export const HelpRequest =
  mongoose.models.HelpRequest ||
  mongoose.model("HelpRequest", helpRequestSchema);
