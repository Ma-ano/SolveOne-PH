import express, { Router } from "express";

import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireIdempotencyKey } from "../middleware/requireIdempotencyKey.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createOfferRouters({
  offerController,
  offerSchemas,
  authService,
  config,
}) {
  const offerRouter = Router();
  const requestOfferRouter = Router();
  const authenticate = requireAuth(authService);
  const createLimiter = createScopedRateLimiter({
    windowMs: config.offerRateLimitWindowMs,
    limit: config.offerRateLimitMax,
  });
  const evidenceUploadLimiter = createScopedRateLimiter({
    windowMs: config.evidenceUploadRateLimitWindowMs ?? 3600000,
    limit: config.evidenceUploadRateLimitMax ?? 10,
  });

  requestOfferRouter.post(
    "/:requestId/offers",
    authenticate,
    createLimiter,
    validateRequest(offerSchemas.create),
    asyncHandler(offerController.create),
  );
  requestOfferRouter.get(
    "/:requestId/offers",
    authenticate,
    validateRequest(offerSchemas.forRequest),
    asyncHandler(offerController.listForRequest),
  );

  offerRouter.get(
    "/me",
    authenticate,
    validateRequest(offerSchemas.mine),
    asyncHandler(offerController.listMine),
  );
  for (const [operation, handler] of [
    ["accept", offerController.accept],
    ["reject", offerController.reject],
    ["withdraw", offerController.withdraw],
    ["start", offerController.start],
  ]) {
    offerRouter.post(
      `/:offerId/${operation}`,
      authenticate,
      ...(operation === "accept" ? [requireIdempotencyKey] : []),
      validateRequest(offerSchemas.transition),
      asyncHandler(handler),
    );
  }

  offerRouter.post(
    "/:offerId/complete",
    authenticate,
    validateRequest(offerSchemas.complete),
    asyncHandler(offerController.complete),
  );
  offerRouter.post(
    "/:offerId/confirm",
    authenticate,
    requireIdempotencyKey,
    validateRequest(offerSchemas.transition),
    asyncHandler(offerController.confirm),
  );
  offerRouter.post(
    "/:offerId/dispute",
    authenticate,
    validateRequest(offerSchemas.dispute),
    asyncHandler(offerController.dispute),
  );
  offerRouter.get(
    "/:offerId/evidence",
    authenticate,
    validateRequest(offerSchemas.evidence),
    asyncHandler(offerController.evidence),
  );
  offerRouter.post(
    "/:offerId/evidence/uploads",
    authenticate,
    evidenceUploadLimiter,
    express.raw({ type: "application/octet-stream", limit: "5mb" }),
    validateRequest(offerSchemas.evidence),
    asyncHandler(offerController.uploadEvidenceFile),
  );
  offerRouter.get(
    "/:offerId/evidence/files/:fileId",
    authenticate,
    validateRequest(offerSchemas.evidenceFile),
    asyncHandler(offerController.evidenceFile),
  );

  return Object.freeze({ offerRouter, requestOfferRouter });
}
