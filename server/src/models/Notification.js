import mongoose from "mongoose";

import {
  NOTIFICATION_KINDS,
  NOTIFICATION_RESOURCE_TYPES,
} from "../constants/statuses.js";

const notificationSchema = new mongoose.Schema(
  {
    recipientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    kind: {
      type: String,
      enum: NOTIFICATION_KINDS,
      required: true,
      immutable: true,
    },
    resourceType: {
      type: String,
      enum: NOTIFICATION_RESOURCE_TYPES,
      required: true,
      immutable: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    requestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "HelpRequest",
      default: null,
      immutable: true,
    },
    eventKey: {
      type: String,
      required: true,
      immutable: true,
      select: false,
    },
    readAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true, immutable: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, minimize: false },
);

notificationSchema.index(
  { recipientId: 1, createdAt: -1, _id: -1 },
  { name: "notification_recipient_created" },
);
notificationSchema.index(
  { recipientId: 1, readAt: 1, createdAt: -1, _id: -1 },
  { name: "notification_recipient_unread" },
);
notificationSchema.index(
  { eventKey: 1 },
  { name: "notification_event_unique", unique: true },
);
notificationSchema.index(
  { expiresAt: 1 },
  { name: "notification_expiry_ttl", expireAfterSeconds: 0 },
);

export const Notification =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
