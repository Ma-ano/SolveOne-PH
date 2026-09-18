import { Router } from "express";

import { requireAuth } from "../middleware/requireAuth.js";
import { createScopedRateLimiter } from "../middleware/rateLimiters.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  accountClosureSchema,
  emailActionSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
  restoreSessionSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../validators/auth.schemas.js";

export function createAuthRouter({ authController, authService, config }) {
  const router = Router();
  const authLimiter = createScopedRateLimiter({
    windowMs: config.authRateLimitWindowMs,
    limit: config.authRateLimitMax,
  });
  const emailLimiter = createScopedRateLimiter({
    windowMs: config.authRateLimitWindowMs,
    limit: config.emailActionRateLimitMax,
  });
  const authenticate = requireAuth(authService);

  router.post(
    "/register",
    authLimiter,
    validateRequest(registerSchema),
    asyncHandler(authController.register),
  );
  router.post(
    "/login",
    authLimiter,
    validateRequest(loginSchema),
    asyncHandler(authController.login),
  );
  router.post(
    "/verify-email",
    emailLimiter,
    validateRequest(verifyEmailSchema),
    asyncHandler(authController.verifyEmail),
  );
  router.post(
    "/resend-verification",
    emailLimiter,
    validateRequest(emailActionSchema),
    asyncHandler(authController.resendVerification),
  );
  router.post(
    "/forgot-password",
    emailLimiter,
    validateRequest(emailActionSchema),
    asyncHandler(authController.forgotPassword),
  );
  router.post(
    "/reset-password",
    emailLimiter,
    validateRequest(resetPasswordSchema),
    asyncHandler(authController.resetPassword),
  );
  router.post(
    "/session",
    authLimiter,
    validateRequest(restoreSessionSchema),
    asyncHandler(authController.restoreSession),
  );
  router.post(
    "/refresh",
    authLimiter,
    validateRequest(refreshSchema),
    asyncHandler(authController.refresh),
  );
  router.post(
    "/logout",
    validateRequest(logoutSchema),
    asyncHandler(authController.logout),
  );
  router.post(
    "/logout-all",
    authenticate,
    asyncHandler(authController.logoutAll),
  );
  router.get(
    "/account-closure",
    authenticate,
    asyncHandler(authController.accountClosureRequirements),
  );
  router.post(
    "/account-closure",
    authLimiter,
    authenticate,
    validateRequest(accountClosureSchema),
    asyncHandler(authController.closeAccount),
  );

  return router;
}
