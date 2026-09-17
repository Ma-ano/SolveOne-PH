import mongoose from "mongoose";

const safeInteger = {
  validator: Number.isSafeInteger,
  message: "Amount must be an integer number of centavos",
};

const donationRefundSchema = new mongoose.Schema(
  {
    providerRefundId: {
      type: String,
      maxlength: 100,
      required: true,
      immutable: true,
      select: false,
    },
    providerPaymentId: {
      type: String,
      maxlength: 100,
      required: true,
      immutable: true,
      select: false,
    },
    mode: {
      type: String,
      enum: ["test", "live"],
      required: true,
      immutable: true,
    },
    amountCentavos: {
      type: Number,
      min: 100,
      validate: safeInteger,
      required: true,
      immutable: true,
    },
    currency: { type: String, enum: ["PHP"], required: true, immutable: true },
    donationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlatformDonation",
      default: null,
    },
    appliedAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

donationRefundSchema.index(
  { mode: 1, providerRefundId: 1 },
  { name: "donation_refund_provider_unique", unique: true },
);
donationRefundSchema.index(
  { appliedAt: 1, mode: 1, providerPaymentId: 1 },
  { name: "donation_refund_deferred" },
);

export const DonationRefund =
  mongoose.models.DonationRefund ||
  mongoose.model("DonationRefund", donationRefundSchema);
