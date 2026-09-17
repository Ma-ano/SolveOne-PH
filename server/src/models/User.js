import mongoose from "mongoose";

import {
  ACCOUNT_STATUSES,
  USER_ROLES,
  VERIFICATION_LEVELS,
} from "../constants/statuses.js";

const agreementSchema = new mongoose.Schema(
  {
    termsAcceptedAt: { type: Date, required: true },
    termsVersion: { type: String, required: true },
    privacyAcceptedAt: { type: Date, required: true },
    privacyVersion: { type: String, required: true },
  },
  { _id: false },
);

const verificationSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: VERIFICATION_LEVELS,
      default: "UNVERIFIED",
      required: true,
    },
  },
  { _id: false },
);

const locationSchema = new mongoose.Schema(
  {
    country: { type: String, trim: true, maxlength: 80, default: null },
    province: { type: String, trim: true, maxlength: 80, default: null },
    city: { type: String, trim: true, maxlength: 80, default: null },
    barangay: { type: String, trim: true, maxlength: 120, default: null },
  },
  { _id: false },
);

const avatarSchema = new mongoose.Schema(
  {
    storageKey: {
      type: String,
      required: true,
      select: false,
      immutable: true,
    },
    mimeType: {
      type: String,
      enum: ["image/jpeg", "image/png", "image/webp"],
      required: true,
    },
    updatedAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 50 },
    lastName: { type: String, required: true, trim: true, maxlength: 50 },
    email: { type: String, required: true, trim: true, maxlength: 254 },
    emailNormalized: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      select: false,
    },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: "user", required: true },
    accountStatus: {
      type: String,
      enum: ACCOUNT_STATUSES,
      default: "active",
      required: true,
    },
    suspendedAt: { type: Date, default: null, select: false },
    suspendedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      select: false,
    },
    suspensionReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
      select: false,
    },
    reinstatedAt: { type: Date, default: null, select: false },
    reinstatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      select: false,
    },
    accountClosedAt: { type: Date, default: null, select: false },
    accountClosurePolicyVersion: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
      select: false,
    },
    emailVerified: { type: Boolean, default: false, required: true },
    bio: { type: String, trim: true, maxlength: 500, default: null },
    skills: {
      type: [{ type: String, trim: true, maxlength: 50 }],
      default: [],
      validate: {
        validator: (skills) => skills.length <= 15,
        message: "A profile can list at most 15 skills",
      },
    },
    location: { type: locationSchema, default: () => ({}) },
    avatar: { type: avatarSchema, default: null },
    verification: { type: verificationSchema, default: () => ({}) },
    agreements: { type: agreementSchema, required: true },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

userSchema.index(
  { emailNormalized: 1 },
  { unique: true, name: "user_email_unique" },
);

userSchema.set("toJSON", {
  transform(document, result) {
    delete result.passwordHash;
    delete result.emailNormalized;
    delete result.agreements;
    delete result.suspendedAt;
    delete result.suspendedBy;
    delete result.suspensionReason;
    delete result.reinstatedAt;
    delete result.reinstatedBy;
    delete result.accountClosedAt;
    delete result.accountClosurePolicyVersion;
    if (result.avatar) {
      delete result.avatar.storageKey;
    }
    return result;
  },
});

export const User = mongoose.models.User || mongoose.model("User", userSchema);
