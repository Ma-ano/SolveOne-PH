import { Router } from "express";

import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { optionalAuth } from "../middleware/optionalAuth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireIdempotencyKey } from "../middleware/requireIdempotencyKey.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createGiveawayRouters({
  controller,
  schemas,
  authService,
  config,
}) {
  const itemRouter = Router();
  const reservationRouter = Router();
  const authenticate = requireAuth(authService);
  const authenticateWhenPresent = optionalAuth(authService);
  const mutateLimit = createScopedRateLimiter({
    windowMs: config.offerRateLimitWindowMs,
    limit: config.offerRateLimitMax,
  });

  itemRouter.get(
    "/",
    validateRequest(schemas.publicList),
    asyncHandler(controller.listPublic),
  );
  itemRouter.post(
    "/",
    authenticate,
    mutateLimit,
    requireIdempotencyKey,
    validateRequest(schemas.create),
    asyncHandler(controller.create),
  );
  itemRouter.get(
    "/mine",
    authenticate,
    validateRequest(schemas.mine),
    asyncHandler(controller.listMine),
  );
  itemRouter.get(
    "/:itemId/matches",
    authenticate,
    validateRequest(schemas.matches),
    asyncHandler(controller.matches),
  );
  itemRouter.post(
    "/:itemId/reservations",
    authenticate,
    mutateLimit,
    requireIdempotencyKey,
    validateRequest(schemas.reserve),
    asyncHandler(controller.reserve),
  );
  itemRouter.post(
    "/:itemId/remove",
    authenticate,
    validateRequest(schemas.remove),
    asyncHandler(controller.remove),
  );
  itemRouter.get(
    "/:itemId",
    authenticateWhenPresent,
    validateRequest(schemas.item),
    asyncHandler(controller.get),
  );

  reservationRouter.get(
    "/mine",
    authenticate,
    validateRequest(schemas.reservations),
    asyncHandler(controller.reservations),
  );
  reservationRouter.post(
    "/:reservationId/confirm",
    authenticate,
    requireIdempotencyKey,
    validateRequest(schemas.reservationTransition),
    asyncHandler(controller.confirm),
  );
  reservationRouter.post(
    "/:reservationId/cancel",
    authenticate,
    validateRequest(schemas.reservationTransition),
    asyncHandler(controller.cancel),
  );

  return Object.freeze({ itemRouter, reservationRouter });
}
