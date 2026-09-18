import { Router } from "express";

import { requireAuth } from "../middleware/requireAuth.js";
import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createAiAssistanceRouter({
  controller,
  schemas,
  authService,
  config,
}) {
  const router = Router();
  const authenticate = requireAuth(authService);
  router.get("/status", authenticate, asyncHandler(controller.status));
  router.post(
    "/request-structure",
    authenticate,
    createScopedRateLimiter({
      windowMs: config.aiRequestRateLimitWindowMs,
      limit: config.aiRequestRateLimitMax,
      keyGenerator: (req) => req.auth.userId,
    }),
    validateRequest(schemas.structureRequest),
    asyncHandler(controller.structureRequest),
  );
  return router;
}
