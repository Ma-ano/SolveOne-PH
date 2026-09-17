import mongoose from "mongoose";

import {
  MISSION_CONTRIBUTION_STATUSES,
  MISSION_RESOURCE_TYPES,
} from "../constants/statuses.js";

const missionContributionSchema = new mongoose.Schema(
  {
    missionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CommunityMission",
      required: true,
      immutable: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    contributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    resourceType: {
      type: String,
      enum: MISSION_RESOURCE_TYPES,
      required: true,
      immutable: true,
    },
    message: {
      type: String,
      trim: true,
      minlength: 10,
      maxlength: 1000,
      required: true,
      immutable: true,
    },
    quantity: {
      type: Number,
      min: 1,
      max: 1000,
      required: true,
      immutable: true,
    },
    estimatedMinutes: { type: Number, min: 1, max: 10080, default: null },
    actualMinutes: { type: Number, min: 1, max: 10080, default: null },
    completionNote: {
      type: String,
      trim: true,
      minlength: 10,
      maxlength: 2000,
      default: null,
    },
    status: {
      type: String,
      enum: MISSION_CONTRIBUTION_STATUSES,
      default: "pending",
      required: true,
    },
    activeKey: { type: String, select: false },
    acceptedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completionSubmittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

missionContributionSchema.pre("validate", function validateDuration() {
  if (
    this.resourceType === "item" &&
    (this.estimatedMinutes !== null || this.actualMinutes !== null)
  ) {
    this.invalidate(
      "estimatedMinutes",
      "Item contributions cannot record time",
    );
  }
});

missionContributionSchema.index(
  { activeKey: 1 },
  {
    name: "mission_contribution_active_unique",
    unique: true,
    partialFilterExpression: { activeKey: { $type: "string" } },
  },
);
missionContributionSchema.index(
  { missionId: 1, status: 1, createdAt: -1, _id: -1 },
  { name: "mission_contribution_mission" },
);
missionContributionSchema.index(
  { contributorId: 1, createdAt: -1, _id: -1 },
  { name: "mission_contribution_contributor" },
);

export const MissionContribution =
  mongoose.models.MissionContribution ||
  mongoose.model("MissionContribution", missionContributionSchema);
