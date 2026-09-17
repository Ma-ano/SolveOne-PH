import { readBearerToken } from "./requireAuth.js";

export function optionalAuth(authService) {
  return async function authenticateWhenPresent(req, res, next) {
    const accessToken = readBearerToken(req);
    if (!accessToken) {
      next();
      return;
    }

    try {
      req.auth = await authService.authenticateAccessToken(accessToken);
      next();
    } catch (error) {
      next(error);
    }
  };
}
