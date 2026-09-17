import mongoose from "mongoose";

const donationWebhookEventSchema = new mongoose.Schema(
  {
    providerEventId: {
      type: String,
      maxlength: 100,
      required: true,
      immutable: true,
      select: false,
    },
    eventType: {
      type: String,
      maxlength: 100,
      required: true,
      immutable: true,
    },
    mode: {
      type: String,
      enum: ["test", "live"],
      required: true,
      immutable: true,
    },
    outcome: {
      type: String,
      enum: ["processed", "deferred", "ignored"],
      required: true,
    },
    donationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlatformDonation",
      default: null,
    },
    providerRefundId: {
      type: String,
      maxlength: 100,
      default: null,
      select: false,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

donationWebhookEventSchema.index(
  { mode: 1, providerEventId: 1 },
  { name: "donation_webhook_event_unique", unique: true },
);
donationWebhookEventSchema.index(
  { donationId: 1, createdAt: -1 },
  { name: "donation_webhook_history" },
);

export const DonationWebhookEvent =
  mongoose.models.DonationWebhookEvent ||
  mongoose.model("DonationWebhookEvent", donationWebhookEventSchema);
