import { Router } from "express";

import { optionalAuth } from "../middleware/optionalAuth.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createRequestRouters({
  requestController,
  requestSchemas,
  authService,
}) {
  const requestRouter = Router();
  const adminRequestRouter = Router();
  const authenticate = requireAuth(authService);
  const authenticateWhenPresent = optionalAuth(authService);
  const moderate = requireRole("moderator", "admin");

  requestRouter.get(
    "/",
    validateRequest(requestSchemas.publicList),
    asyncHandler(requestController.listPublic),
  );
  requestRouter.get(
    "/discover",
    authenticateWhenPresent,
    validateRequest(requestSchemas.discoveryList),
    asyncHandler(requestController.discover),
  );
  requestRouter.get(
    "/solvable",
    authenticateWhenPresent,
    validateRequest(requestSchemas.solvableList),
    asyncHandler(requestController.solvable),
  );
  requestRouter.post(
    "/",
    authenticate,
    validateRequest(requestSchemas.createDraft),
    asyncHandler(requestController.createDraft),
  );
  requestRouter.get(
    "/mine",
    authenticate,
    validateRequest(requestSchemas.ownerList),
    asyncHandler(requestController.listOwned),
  );
  requestRouter.get(
    "/:requestId",
    authenticateWhenPresent,
    validateRequest(requestSchemas.requestId),
    asyncHandler(requestController.getRequest),
  );
  requestRouter.patch(
    "/:requestId",
    authenticate,
    validateRequest(requestSchemas.updateDraft),
    asyncHandler(requestController.updateDraft),
  );
  requestRouter.post(
    "/:requestId/submit",
    authenticate,
    validateRequest(requestSchemas.requestId),
    asyncHandler(requestController.submit),
  );
  requestRouter.post(
    "/:requestId/cancel",
    authenticate,
    validateRequest(requestSchemas.requestId),
    asyncHandler(requestController.cancel),
  );

  adminRequestRouter.use(authenticate, moderate);
  adminRequestRouter.get(
    "/",
    validateRequest(requestSchemas.moderationList),
    asyncHandler(requestController.listForModeration),
  );
  adminRequestRouter.post(
    "/:requestId/approve",
    validateRequest(requestSchemas.approve),
    asyncHandler(requestController.approve),
  );
  adminRequestRouter.post(
    "/:requestId/reject",
    validateRequest(requestSchemas.decisionWithNotes),
    asyncHandler(requestController.reject),
  );
  adminRequestRouter.post(
    "/:requestId/request-changes",
    validateRequest(requestSchemas.decisionWithNotes),
    asyncHandler(requestController.requestChanges),
  );

  return Object.freeze({ requestRouter, adminRequestRouter });
}
