import { Router } from "express";

import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createConversationRouters({
  conversationController,
  conversationSchemas,
  authService,
  config,
}) {
  const conversationRouter = Router();
  const messageRouter = Router();
  const authenticate = requireAuth(authService);
  const sendLimiter = createScopedRateLimiter({
    windowMs: config.messageRateLimitWindowMs,
    limit: config.messageRateLimitMax,
    keyGenerator: (req) => req.auth.userId,
  });

  conversationRouter.use(authenticate);
  conversationRouter.get(
    "/",
    validateRequest(conversationSchemas.list),
    asyncHandler(conversationController.list),
  );
  conversationRouter.get(
    "/:conversationId",
    validateRequest(conversationSchemas.get),
    asyncHandler(conversationController.get),
  );
  conversationRouter.get(
    "/:conversationId/messages",
    validateRequest(conversationSchemas.messages),
    asyncHandler(conversationController.listMessages),
  );
  conversationRouter.post(
    "/:conversationId/messages",
    sendLimiter,
    validateRequest(conversationSchemas.send),
    asyncHandler(conversationController.send),
  );
  conversationRouter.post(
    "/:conversationId/read",
    validateRequest(conversationSchemas.read),
    asyncHandler(conversationController.markRead),
  );

  messageRouter.post(
    "/:messageId/report",
    authenticate,
    validateRequest(conversationSchemas.report),
    asyncHandler(conversationController.reportMessage),
  );

  return Object.freeze({ conversationRouter, messageRouter });
}
