import { USER_ROLES } from "../constants/statuses.js";
import { AppError } from "../utils/AppError.js";

export function requireRole(...allowedRoles) {
  if (
    allowedRoles.length === 0 ||
    allowedRoles.some((role) => !USER_ROLES.includes(role))
  ) {
    throw new Error("requireRole needs at least one valid user role");
  }

  const allowed = new Set(allowedRoles);

  return function authorizeRole(req, res, next) {
    if (!req.auth) {
      next(
        new AppError({
          statusCode: 401,
          code: "AUTH_REQUIRED",
          message: "Authentication is required",
        }),
      );
      return;
    }

    if (!allowed.has(req.auth.role)) {
      next(
        new AppError({
          statusCode: 403,
          code: "FORBIDDEN",
          message: "You do not have permission to perform this action",
        }),
      );
      return;
    }

    next();
  };
}
