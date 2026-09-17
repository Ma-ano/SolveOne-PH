import mongoose from "mongoose";

import { HELP_OFFER_STATUSES, HELP_TYPES } from "../constants/statuses.js";

const helpOfferSchema = new mongoose.Schema(
  {
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpRequest",
      required: true,
      immutable: true,
    },
    helperId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    helpType: {
      type: String,
      enum: HELP_TYPES,
      required: true,
      immutable: true,
    },
    needItemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    message: {
      type: String,
      trim: true,
      minlength: 10,
      maxlength: 1000,
      required: true,
    },
    quantity: { type: Number, min: 1, max: 10000, default: null },
    pledgedValueCentavos: {
      type: Number,
      min: 0,
      max: 100000000,
      default: null,
    },
    estimatedMinutes: {
      type: Number,
      min: 1,
      max: 10080,
      default: null,
    },
    status: {
      type: String,
      enum: HELP_OFFER_STATUSES,
      default: "pending",
      required: true,
    },
    activeKey: {
      type: String,
      select: false,
    },
    acceptedAt: { type: Date, default: null },
    startedAt: { type: Date, default: null },
    completionSubmittedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

helpOfferSchema.pre("validate", function validateOfferShape() {
  const hasQuantity = Number.isInteger(this.quantity) && this.quantity > 0;
  const hasPledge =
    Number.isInteger(this.pledgedValueCentavos) &&
    this.pledgedValueCentavos > 0;
  const hasMinutes =
    Number.isInteger(this.estimatedMinutes) && this.estimatedMinutes > 0;

  if (
    (this.helpType === "money" && (!hasPledge || hasQuantity || hasMinutes)) ||
    (this.helpType === "item" && (!hasQuantity || hasPledge || hasMinutes)) ||
    (["skill", "time"].includes(this.helpType) &&
      (!hasQuantity || !hasMinutes || hasPledge))
  ) {
    this.invalidate(
      "helpType",
      "Offer quantity, pledge, and time fields must match the help type",
    );
  }
});

helpOfferSchema.index(
  { requestId: 1, status: 1, createdAt: -1, _id: -1 },
  { name: "offer_request_status" },
);
helpOfferSchema.index(
  { helperId: 1, createdAt: -1, _id: -1 },
  { name: "offer_helper_created" },
);
helpOfferSchema.index(
  { activeKey: 1 },
  {
    name: "offer_active_relationship_unique",
    unique: true,
    partialFilterExpression: { activeKey: { $type: "string" } },
  },
);

export const HelpOffer =
  mongoose.models.HelpOffer || mongoose.model("HelpOffer", helpOfferSchema);
