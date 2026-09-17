import { Router } from "express";

import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createPrivacyRequestRouters({
  controller,
  schemas,
  authService,
}) {
  const ownerRouter = Router();
  const adminRouter = Router();
  const authenticate = requireAuth(authService);
  const submissionLimiter = createScopedRateLimiter({
    windowMs: 24 * 60 * 60 * 1000,
    limit: 5,
    keyGenerator: (req) => req.auth.userId,
  });

  ownerRouter.use(authenticate);
  ownerRouter.post(
    "/",
    submissionLimiter,
    validateRequest(schemas.submit),
    asyncHandler(controller.submit),
  );
  ownerRouter.get(
    "/",
    validateRequest(schemas.ownerList),
    asyncHandler(controller.ownerList),
  );
  ownerRouter.get(
    "/:requestId",
    validateRequest(schemas.target),
    asyncHandler(controller.ownerDetail),
  );
  ownerRouter.post(
    "/:requestId/cancel",
    validateRequest(schemas.target),
    asyncHandler(controller.cancel),
  );

  adminRouter.use(authenticate, requireRole("admin"));
  adminRouter.get(
    "/",
    validateRequest(schemas.adminList),
    asyncHandler(controller.adminList),
  );
  adminRouter.get(
    "/:requestId",
    validateRequest(schemas.target),
    asyncHandler(controller.adminDetail),
  );
  adminRouter.post(
    "/:requestId/claim",
    validateRequest(schemas.target),
    asyncHandler(controller.claim),
  );
  adminRouter.post(
    "/:requestId/release",
    validateRequest(schemas.target),
    asyncHandler(controller.release),
  );
  adminRouter.post(
    "/:requestId/resolve",
    validateRequest(schemas.resolve),
    asyncHandler(controller.resolve),
  );

  return Object.freeze({ ownerRouter, adminRouter });
}
