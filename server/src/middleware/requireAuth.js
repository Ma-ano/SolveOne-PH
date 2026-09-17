import { AppError } from "../utils/AppError.js";

export function readBearerToken(req) {
  const authorization = req.get("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

export function requireAuth(authService) {
  return async function authenticateRequest(req, res, next) {
    try {
      const accessToken = readBearerToken(req);

      if (!accessToken) {
        throw new AppError({
          statusCode: 401,
          code: "AUTH_REQUIRED",
          message: "Authentication is required",
        });
      }

      req.auth = await authService.authenticateAccessToken(accessToken);
      next();
    } catch (error) {
      next(error);
    }
  };
}
