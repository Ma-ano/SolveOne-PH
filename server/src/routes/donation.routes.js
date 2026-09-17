import express, { Router } from "express";

import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireIdempotencyKey } from "../middleware/requireIdempotencyKey.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createDonationRouters({ controller, schemas, authService }) {
  const ownerRouter = Router();
  const adminRouter = Router();
  const webhookRouter = Router();
  ownerRouter.use(requireAuth(authService));
  ownerRouter.post(
    "/checkout",
    createScopedRateLimiter({
      windowMs: 60 * 60 * 1000,
      limit: 6,
      keyGenerator: (req) => req.auth.userId,
    }),
    requireIdempotencyKey,
    validateRequest(schemas.checkout),
    asyncHandler(controller.checkout),
  );
  ownerRouter.get(
    "/me",
    validateRequest(schemas.history),
    asyncHandler(controller.history),
  );
  adminRouter.use(requireAuth(authService), requireRole("admin"));
  adminRouter.get("/dashboard", asyncHandler(controller.dashboard));
  webhookRouter.post(
    "/paymongo",
    createScopedRateLimiter({
      windowMs: 60 * 1000,
      limit: 600,
    }),
    express.raw({ type: "application/json", limit: "128kb" }),
    asyncHandler(controller.webhook),
  );
  return Object.freeze({ ownerRouter, adminRouter, webhookRouter });
}
