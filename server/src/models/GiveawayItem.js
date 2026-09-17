import mongoose from "mongoose";

import {
  GIVEAWAY_ITEM_CONDITIONS,
  GIVEAWAY_ITEM_STATUSES,
} from "../constants/statuses.js";

const privateLocationSchema = new mongoose.Schema(
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

const giveawayItemSchema = new mongoose.Schema(
  {
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    title: {
      type: String,
      trim: true,
      minlength: 5,
      maxlength: 120,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      minlength: 20,
      maxlength: 2000,
      required: true,
    },
    category: {
      type: String,
      trim: true,
      maxlength: 60,
      required: true,
    },
    condition: {
      type: String,
      enum: GIVEAWAY_ITEM_CONDITIONS,
      required: true,
    },
    quantity: { type: Number, min: 1, max: 100, required: true },
    reservedQuantity: { type: Number, min: 0, default: 0 },
    givenQuantity: { type: Number, min: 0, default: 0 },
    photos: {
      type: [
        new mongoose.Schema(
          {
            storageKey: { type: String, required: true, select: false },
            mimeType: { type: String, required: true },
          },
          { _id: true, minimize: false },
        ),
      ],
      default: [],
      select: false,
    },
    location: { type: privateLocationSchema, required: true },
    publicLocation: { type: publicLocationSchema, required: true },
    status: {
      type: String,
      enum: GIVEAWAY_ITEM_STATUSES,
      default: "available",
      required: true,
    },
    givenAt: { type: Date, default: null },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false },
);

giveawayItemSchema.pre("validate", function validateInventory() {
  const reserved = this.reservedQuantity ?? 0;
  const given = this.givenQuantity ?? 0;
  if (reserved + given > this.quantity) {
    this.invalidate(
      "reservedQuantity",
      "Reserved and given quantities cannot exceed total quantity",
    );
  }
});

giveawayItemSchema.index(
  { status: 1, category: 1, createdAt: -1, _id: -1 },
  { name: "giveaway_public_category" },
);
giveawayItemSchema.index(
  { status: 1, "publicLocation.province": 1, createdAt: -1, _id: -1 },
  { name: "giveaway_public_province" },
);
giveawayItemSchema.index(
  { ownerId: 1, createdAt: -1, _id: -1 },
  { name: "giveaway_owner_created" },
);

export const GiveawayItem =
  mongoose.models.GiveawayItem ||
  mongoose.model("GiveawayItem", giveawayItemSchema);
