import mongoose from "mongoose";

import {
  COMMUNITY_MISSION_STATUSES,
  MISSION_RESOURCE_TYPES,
  MISSION_VERIFICATION_STATUSES,
  REQUEST_SAFETY_FLAGS,
} from "../constants/statuses.js";

const locationSchema = new mongoose.Schema(
  {
    country: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "Philippines",
    },
    province: { type: String, trim: true, maxlength: 80, required: true },
    city: { type: String, trim: true, maxlength: 80, required: true },
    barangay: { type: String, trim: true, maxlength: 120, default: null },
  },
  { _id: false, minimize: false },
);

const publicLocationSchema = new mongoose.Schema(
  {
    province: { type: String, trim: true, maxlength: 80, required: true },
    city: { type: String, trim: true, maxlength: 80, required: true },
  },
  { _id: false, minimize: false },
);

const resourceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      minlength: 3,
      maxlength: 100,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      minlength: 10,
      maxlength: 500,
      required: true,
    },
    type: { type: String, enum: MISSION_RESOURCE_TYPES, required: true },
    quantity: { type: Number, min: 1, max: 1000, required: true },
    reservedQuantity: { type: Number, min: 0, default: 0 },
    fulfilledQuantity: { type: Number, min: 0, default: 0 },
    estimatedMinutes: { type: Number, min: 15, max: 10080, default: null },
    requiredSkills: {
      type: [{ type: String, trim: true, minlength: 2, maxlength: 50 }],
      default: [],
    },
  },
  { minimize: false },
);

resourceSchema.pre("validate", function validateResource() {
  const reserved = this.reservedQuantity ?? 0;
  const fulfilled = this.fulfilledQuantity ?? 0;
  if (reserved + fulfilled > this.quantity) {
    this.invalidate(
      "reservedQuantity",
      "Reserved and fulfilled quantities cannot exceed total quantity",
    );
  }
  if (this.type === "item" && this.estimatedMinutes !== null) {
    this.invalidate("estimatedMinutes", "Item resources cannot estimate time");
  }
  if (this.type === "item" && this.requiredSkills.length) {
    this.invalidate("requiredSkills", "Item resources cannot require skills");
  }
});

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

const communityMissionSchema = new mongoose.Schema(
  {
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    title: {
      type: String,
      trim: true,
      minlength: 8,
      maxlength: 140,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      minlength: 40,
      maxlength: 5000,
      required: true,
    },
    category: {
      type: String,
      trim: true,
      minlength: 2,
      maxlength: 60,
      required: true,
    },
    location: { type: locationSchema, required: true },
    publicLocation: { type: publicLocationSchema, required: true },
    requiredResources: {
      type: [resourceSchema],
      validate: {
        validator: (resources) =>
          resources.length >= 1 && resources.length <= 20,
        message: "A mission needs between one and twenty resources",
      },
      required: true,
    },
    evidence: {
      note: {
        type: String,
        trim: true,
        minlength: 20,
        maxlength: 2000,
        required: true,
        select: false,
      },
    },
    verificationStatus: {
      type: String,
      enum: MISSION_VERIFICATION_STATUSES,
      default: "unverified",
      required: true,
    },
    status: {
      type: String,
      enum: COMMUNITY_MISSION_STATUSES,
      default: "draft",
      required: true,
    },
    moderation: { type: moderationSchema, default: () => ({}) },
    safetyFlags: {
      type: [{ type: String, enum: REQUEST_SAFETY_FLAGS }],
      default: [],
      select: false,
    },
    activityVersion: { type: Number, min: 0, default: 0, select: false },
    publishedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

communityMissionSchema.index(
  { status: 1, verificationStatus: 1, publishedAt: -1, _id: -1 },
  { name: "mission_public_listing" },
);
communityMissionSchema.index(
  { creatorId: 1, updatedAt: -1, _id: -1 },
  { name: "mission_creator_updated" },
);
communityMissionSchema.index(
  { status: 1, "moderation.submittedAt": 1, _id: 1 },
  { name: "mission_moderation_queue" },
);
communityMissionSchema.index(
  {
    status: 1,
    "publicLocation.province": 1,
    "requiredResources.requiredSkills": 1,
    publishedAt: 1,
  },
  { name: "mission_volunteer_matching" },
);

export const CommunityMission =
  mongoose.models.CommunityMission ||
  mongoose.model("CommunityMission", communityMissionSchema);
