import mongoose from "mongoose";

import { SECURITY_EVENT_TYPES } from "../constants/statuses.js";

const securityEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      immutable: true,
    },
    type: {
      type: String,
      enum: SECURITY_EVENT_TYPES,
      required: true,
      immutable: true,
    },
    ipHash: { type: String, required: true, select: false, immutable: true },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
      immutable: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

securityEventSchema.index(
  { type: 1, createdAt: -1 },
  { name: "security_event_type_created" },
);
securityEventSchema.index(
  { userId: 1, createdAt: -1 },
  { name: "security_event_user_created" },
);

export const SecurityEvent =
  mongoose.models.SecurityEvent ||
  mongoose.model("SecurityEvent", securityEventSchema);
