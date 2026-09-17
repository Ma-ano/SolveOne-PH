import mongoose from "mongoose";

import { AUTH_TOKEN_TYPES } from "../constants/statuses.js";

const authTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    type: {
      type: String,
      enum: AUTH_TOKEN_TYPES,
      required: true,
      immutable: true,
    },
    tokenHash: { type: String, required: true, unique: true, select: false },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

authTokenSchema.index(
  { userId: 1, type: 1, consumedAt: 1 },
  { name: "auth_token_user_type_active" },
);
authTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "auth_token_ttl" },
);

export const AuthToken =
  mongoose.models.AuthToken || mongoose.model("AuthToken", authTokenSchema);
