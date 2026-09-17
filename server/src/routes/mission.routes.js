import { Router } from "express";

import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireIdempotencyKey } from "../middleware/requireIdempotencyKey.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createMissionRouters({
  controller,
  schemas,
  authService,
  config,
}) {
  const missionRouter = Router();
  const contributionRouter = Router();
  const adminRouter = Router();
  const authenticate = requireAuth(authService);
  const optionalAuthenticate = optionalAuth(authService);
  const mutateLimit = createScopedRateLimiter({
    windowMs: config.offerRateLimitWindowMs,
    limit: config.offerRateLimitMax,
  });

  missionRouter.get(
    "/",
    validateRequest(schemas.publicList),
    asyncHandler(controller.list),
  );
  missionRouter.get(
    "/matches",
    authenticate,
    validateRequest(schemas.matches),
    asyncHandler(controller.matches),
  );
  missionRouter.post(
    "/",
    authenticate,
    mutateLimit,
    requireIdempotencyKey,
    validateRequest(schemas.create),
    asyncHandler(controller.create),
  );
  missionRouter.get(
    "/mine",
    authenticate,
    validateRequest(schemas.mine),
    asyncHandler(controller.mine),
  );
  missionRouter.get(
    "/:missionId",
    optionalAuthenticate,
    validateRequest(schemas.mission),
    asyncHandler(controller.get),
  );
  missionRouter.patch(
    "/:missionId",
    authenticate,
    validateRequest(schemas.update),
    asyncHandler(controller.update),
  );
  missionRouter.post(
    "/:missionId/submit",
    authenticate,
    validateRequest(schemas.transition),
    asyncHandler(controller.submit),
  );
  missionRouter.post(
    "/:missionId/cancel",
    authenticate,
    validateRequest(schemas.transition),
    asyncHandler(controller.cancel),
  );
  missionRouter.post(
    "/:missionId/contributions",
    authenticate,
    mutateLimit,
    requireIdempotencyKey,
    validateRequest(schemas.createContribution),
    asyncHandler(controller.contribute),
  );
  missionRouter.get(
    "/:missionId/contributions",
    authenticate,
    validateRequest(schemas.contributionList),
    asyncHandler(controller.contributions),
  );

  contributionRouter.get(
    "/mine",
    authenticate,
    validateRequest(schemas.myContributions),
    asyncHandler(controller.myContributions),
  );
  contributionRouter.post(
    "/:contributionId/accept",
    authenticate,
    requireIdempotencyKey,
    validateRequest(schemas.contributionTransition),
    asyncHandler(controller.accept),
  );
  contributionRouter.post(
    "/:contributionId/reject",
    authenticate,
    validateRequest(schemas.contributionTransition),
    asyncHandler(controller.rejectContribution),
  );
  contributionRouter.post(
    "/:contributionId/withdraw",
    authenticate,
    validateRequest(schemas.contributionTransition),
    asyncHandler(controller.withdraw),
  );
  contributionRouter.post(
    "/:contributionId/start",
    authenticate,
    validateRequest(schemas.contributionTransition),
    asyncHandler(controller.start),
  );
  contributionRouter.post(
    "/:contributionId/complete",
    authenticate,
    requireIdempotencyKey,
    validateRequest(schemas.completeContribution),
    asyncHandler(controller.complete),
  );
  contributionRouter.post(
    "/:contributionId/confirm",
    authenticate,
    requireIdempotencyKey,
    validateRequest(schemas.contributionTransition),
    asyncHandler(controller.confirm),
  );

  adminRouter.use(authenticate, requireRole("moderator", "admin"));
  adminRouter.get(
    "/",
    validateRequest(schemas.moderationList),
    asyncHandler(controller.moderationQueue),
  );
  adminRouter.post(
    "/:missionId/approve",
    validateRequest(schemas.approve),
    asyncHandler(controller.approve),
  );
  adminRouter.post(
    "/:missionId/reject",
    validateRequest(schemas.decision),
    asyncHandler(controller.reject),
  );
  adminRouter.post(
    "/:missionId/request-changes",
    validateRequest(schemas.decision),
    asyncHandler(controller.requestChanges),
  );

  return Object.freeze({ missionRouter, contributionRouter, adminRouter });
}
