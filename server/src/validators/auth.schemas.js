import { z } from "zod";

const email = z.string().trim().email().max(254);
const password = z.string().min(12).max(128);
const token = z.string().trim().min(32).max(2048);
const platform = z
  .enum(["android", "ios", "web", "unknown"])
  .default("unknown");
const deviceName = z.string().trim().min(1).max(100).default("Unknown device");

function withPasswordConfirmation(shape) {
  return z
    .object(shape)
    .strict()
    .refine((value) => value.password === value.passwordConfirmation, {
      path: ["passwordConfirmation"],
      message: "Passwords do not match",
    });
}

export const registerSchema = {
  body: withPasswordConfirmation({
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    email,
    password,
    passwordConfirmation: z.string().max(128),
    termsAccepted: z.literal(true),
    privacyAccepted: z.literal(true),
  }),
};

export const loginSchema = {
  body: z
    .object({
      email,
      password: z.string().min(1).max(128),
      deviceName,
      platform,
    })
    .strict(),
};

export const verifyEmailSchema = {
  body: z.object({ token }).strict(),
};

export const emailActionSchema = {
  body: z.object({ email }).strict(),
};

export const resetPasswordSchema = {
  body: withPasswordConfirmation({
    token,
    password,
    passwordConfirmation: z.string().max(128),
  }),
};

export const refreshSchema = {
  body: z
    .object({
      refreshToken: token.optional(),
      deviceName,
      platform,
    })
    .strict(),
};

export const restoreSessionSchema = {
  body: z.object({ deviceName, platform }).strict(),
};

export const logoutSchema = {
  body: z.object({ refreshToken: token.optional() }).strict(),
};

export const accountClosureSchema = {
  body: z
    .object({
      password: z.string().min(1).max(128),
      confirmation: z.literal("CLOSE MY ACCOUNT"),
      retentionAcknowledged: z.literal(true),
      policyVersion: z.string().trim().min(1).max(50),
    })
    .strict(),
};
