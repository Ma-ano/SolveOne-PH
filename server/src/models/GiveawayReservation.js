import mongoose from "mongoose";

import { GIVEAWAY_RESERVATION_STATUSES } from "../constants/statuses.js";

const giveawayReservationSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GiveawayItem",
      required: true,
      immutable: true,
    },
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpRequest",
      required: true,
      immutable: true,
    },
    needItemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    quantity: {
      type: Number,
      min: 1,
      max: 100,
      required: true,
      immutable: true,
    },
    status: {
      type: String,
      enum: GIVEAWAY_RESERVATION_STATUSES,
      default: "reserved",
      required: true,
    },
    activeKey: { type: String, select: false },
    donorConfirmedAt: { type: Date, default: null },
    recipientConfirmedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true, minimize: false },
);

giveawayReservationSchema.index(
  { activeKey: 1 },
  {
    name: "giveaway_reservation_active_unique",
    unique: true,
    partialFilterExpression: { activeKey: { $type: "string" } },
  },
);
giveawayReservationSchema.index(
  { donorId: 1, createdAt: -1, _id: -1 },
  { name: "giveaway_reservation_donor" },
);
giveawayReservationSchema.index(
  { recipientId: 1, createdAt: -1, _id: -1 },
  { name: "giveaway_reservation_recipient" },
);
giveawayReservationSchema.index(
  { requestId: 1, status: 1 },
  { name: "giveaway_reservation_request" },
);

export const GiveawayReservation =
  mongoose.models.GiveawayReservation ||
  mongoose.model("GiveawayReservation", giveawayReservationSchema);
