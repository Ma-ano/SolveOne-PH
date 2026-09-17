import express, { Router } from "express";

import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createVerificationRouters({
  controller,
  schemas,
  authService,
}) {
  const ownerRouter = Router();
  const adminRouter = Router();
  const authenticate = requireAuth(authService);
  const uploadLimit = createScopedRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 4,
    keyGenerator: (req) => req.auth.userId,
  });
  const reviewDownloadLimit = createScopedRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => req.auth.userId,
  });

  ownerRouter.use(authenticate);
  ownerRouter.get("/requirements", asyncHandler(controller.requirements));
  ownerRouter.get("/me", asyncHandler(controller.latestOwn));
  ownerRouter.post(
    "/uploads",
    uploadLimit,
    express.raw({ type: "application/octet-stream", limit: "4mb" }),
    asyncHandler(controller.upload),
  );
  ownerRouter.post(
    "/submit",
    validateRequest(schemas.submit),
    asyncHandler(controller.submit),
  );

  adminRouter.use(authenticate, requireRole("moderator", "admin"));
  adminRouter.get(
    "/",
    validateRequest(schemas.queue),
    asyncHandler(controller.queue),
  );
  adminRouter.post(
    "/:recordId/claim",
    validateRequest(schemas.claim),
    asyncHandler(controller.claim),
  );
  adminRouter.get(
    "/:recordId/documents/:uploadId",
    reviewDownloadLimit,
    validateRequest(schemas.document),
    asyncHandler(controller.document),
  );
  adminRouter.post(
    "/:recordId/approve",
    validateRequest(schemas.approve),
    asyncHandler(controller.approve),
  );
  adminRouter.post(
    "/:recordId/reject",
    validateRequest(schemas.reject),
    asyncHandler(controller.reject),
  );

  return Object.freeze({ ownerRouter, adminRouter });
}
