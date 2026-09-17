import { Router } from "express";

import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createSafetyRouters({ controller, schemas, authService }) {
  const reportRouter = Router();
  const blockRouter = Router();
  const adminRouter = Router();
  const authenticate = requireAuth(authService);
  const reportLimiter = createScopedRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    keyGenerator: (req) => req.auth.userId,
  });
  const blockLimiter = createScopedRateLimiter({
    windowMs: 60 * 60 * 1000,
    limit: 30,
    keyGenerator: (req) => req.auth.userId,
  });

  reportRouter.use(authenticate, reportLimiter);
  reportRouter.post(
    "/users/:userId",
    validateRequest(schemas.reportUser),
    asyncHandler(controller.reportUser),
  );
  reportRouter.post(
    "/requests/:requestId",
    validateRequest(schemas.reportRequest),
    asyncHandler(controller.reportRequest),
  );
  reportRouter.post(
    "/giveaway-items/:itemId",
    validateRequest(schemas.reportGiveaway),
    asyncHandler(controller.reportGiveaway),
  );
  reportRouter.post(
    "/community-missions/:missionId",
    validateRequest(schemas.reportMission),
    asyncHandler(controller.reportMission),
  );

  blockRouter.use(authenticate);
  blockRouter.get(
    "/",
    validateRequest(schemas.listBlocks),
    asyncHandler(controller.listBlocks),
  );
  blockRouter.post(
    "/:userId",
    blockLimiter,
    validateRequest(schemas.userTarget),
    asyncHandler(controller.blockUser),
  );
  blockRouter.delete(
    "/:userId",
    blockLimiter,
    validateRequest(schemas.userTarget),
    asyncHandler(controller.unblockUser),
  );

  adminRouter.use(authenticate, requireRole("moderator", "admin"));
  adminRouter.get(
    "/reports",
    validateRequest(schemas.queue),
    asyncHandler(controller.queue),
  );
  adminRouter.post(
    "/reports/:reportId/claim",
    validateRequest(schemas.reportTarget),
    asyncHandler(controller.claim),
  );
  adminRouter.get(
    "/reports/:reportId",
    validateRequest(schemas.reportTarget),
    asyncHandler(controller.detail),
  );
  adminRouter.post(
    "/reports/:reportId/resolve",
    validateRequest(schemas.resolve),
    asyncHandler(controller.resolve),
  );
  adminRouter.post(
    "/users/:userId/suspend",
    requireRole("admin"),
    validateRequest(schemas.suspend),
    asyncHandler(controller.suspend),
  );
  adminRouter.post(
    "/users/:userId/reinstate",
    requireRole("admin"),
    validateRequest(schemas.reinstate),
    asyncHandler(controller.reinstate),
  );
  adminRouter.get(
    "/audit-logs",
    requireRole("admin"),
    validateRequest(schemas.audit),
    asyncHandler(controller.audit),
  );

  return Object.freeze({ reportRouter, blockRouter, adminRouter });
}
