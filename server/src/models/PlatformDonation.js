import mongoose from "mongoose";

import {
  DONATION_CHECKOUT_STATES,
  PLATFORM_DONATION_STATUSES,
} from "../constants/statuses.js";

export const MIN_DONATION_CENTAVOS = 1000;
export const MAX_DONATION_CENTAVOS = 1000000;

const safeInteger = {
  validator: Number.isSafeInteger,
  message: "Amount must be an integer number of centavos",
};

const platformDonationSchema = new mongoose.Schema(
  {
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    purpose: {
      type: String,
      enum: ["platform"],
      default: "platform",
      required: true,
      immutable: true,
    },
    amountCentavos: {
      type: Number,
      min: MIN_DONATION_CENTAVOS,
      max: MAX_DONATION_CENTAVOS,
      validate: safeInteger,
      required: true,
      immutable: true,
    },
    currency: {
      type: String,
      enum: ["PHP"],
      default: "PHP",
      required: true,
      immutable: true,
    },
    mode: {
      type: String,
      enum: ["test", "live"],
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: PLATFORM_DONATION_STATUSES,
      default: "pending",
      required: true,
    },
    checkoutState: {
      type: String,
      enum: DONATION_CHECKOUT_STATES,
      default: "creating",
      required: true,
    },
    idempotencyKeyHash: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    requestHash: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    checkoutRequestedAt: { type: Date, required: true, immutable: true },
    checkoutClaimExpiresAt: { type: Date, required: true, select: false },
    providerSessionId: {
      type: String,
      maxlength: 100,
      default: null,
      select: false,
    },
    providerPaymentId: {
      type: String,
      maxlength: 100,
      default: null,
      select: false,
    },
    checkoutUrl: {
      type: String,
      maxlength: 2048,
      default: null,
      select: false,
    },
    paidAt: { type: Date, default: null },
    refundedAmountCentavos: {
      type: Number,
      min: 0,
      validate: safeInteger,
      default: 0,
      required: true,
    },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

platformDonationSchema.index(
  { donorId: 1, idempotencyKeyHash: 1 },
  { name: "donation_donor_key_unique", unique: true },
);
platformDonationSchema.index(
  { mode: 1, providerSessionId: 1 },
  {
    name: "donation_provider_session_unique",
    unique: true,
    partialFilterExpression: { providerSessionId: { $type: "string" } },
  },
);
platformDonationSchema.index(
  { mode: 1, providerPaymentId: 1 },
  {
    name: "donation_provider_payment_unique",
    unique: true,
    partialFilterExpression: { providerPaymentId: { $type: "string" } },
  },
);
platformDonationSchema.index(
  { donorId: 1, createdAt: -1, _id: -1 },
  { name: "donation_owner_history" },
);
platformDonationSchema.index(
  { mode: 1, status: 1, createdAt: -1 },
  { name: "donation_admin_status" },
);

export const PlatformDonation =
  mongoose.models.PlatformDonation ||
  mongoose.model("PlatformDonation", platformDonationSchema);
