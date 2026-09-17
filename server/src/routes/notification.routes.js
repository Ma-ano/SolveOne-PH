import { Router } from "express";

import { requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createNotificationRouter({ controller, schemas, authService }) {
  const router = Router();
  router.use(requireAuth(authService));
  router.get("/", validateRequest(schemas.list), asyncHandler(controller.list));
  router.get("/unread-count", asyncHandler(controller.unreadCount));
  router.post(
    "/read-all",
    validateRequest(schemas.readAll),
    asyncHandler(controller.markAllRead),
  );
  router.post(
    "/:notificationId/read",
    validateRequest(schemas.read),
    asyncHandler(controller.markRead),
  );
  return router;
}
