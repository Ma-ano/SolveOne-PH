import { Router } from "express";

import { requireAuth } from "../middleware/requireAuth.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  publicProfileSchema,
  updatePrivateProfileSchema,
} from "../validators/user.schemas.js";

export function createUserRouter({ userController, authService }) {
  const router = Router();
  const authenticate = requireAuth(authService);

  router.get("/me", authenticate, asyncHandler(userController.getMe));
  router.patch(
    "/me",
    authenticate,
    validateRequest(updatePrivateProfileSchema),
    asyncHandler(userController.updateMe),
  );
  router.get(
    "/:userId",
    validateRequest(publicProfileSchema),
    asyncHandler(userController.getPublicProfile),
  );

  return router;
}
