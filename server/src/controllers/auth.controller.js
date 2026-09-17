import { AppError } from "../utils/AppError.js";
import { readBearerToken } from "../middleware/requireAuth.js";

function requestContext(req, overrides = {}) {
  return {
    ipAddress: req.ip,
    ...overrides,
  };
}

function refreshCookieBaseOptions(config) {
  return {
    httpOnly: true,
    secure: config.environment === "production",
    sameSite: "lax",
    path: "/api/v1/auth",
  };
}

function refreshCookieOptions(config) {
  return {
    ...refreshCookieBaseOptions(config),
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  };
}

function isWebSessionRequest(req, platform, usedCookie = false) {
  return usedCookie || platform === "web" || Boolean(req.get("origin"));
}

function sendSession(req, res, session, platform, config, usedCookie = false) {
  const { refreshToken, refreshTokenExpiresAt, ...data } = session;

  if (isWebSessionRequest(req, platform, usedCookie)) {
    res.cookie(
      config.refreshCookieName,
      refreshToken,
      refreshCookieOptions(config),
    );
    return { ...data, refreshTokenExpiresAt };
  }

  return { ...data, refreshToken, refreshTokenExpiresAt };
}

export function createAuthController(authService, config) {
  return Object.freeze({
    async register(req, res) {
      const result = await authService.register(req.validated.body);
      res.status(201).json({ success: true, data: result });
    },

    async login(req, res) {
      const input = req.validated.body;
      const result = await authService.login(input, requestContext(req));
      res.status(200).json({
        success: true,
        data: sendSession(req, res, result, input.platform, config),
      });
    },

    async verifyEmail(req, res) {
      const result = await authService.verifyEmail(req.validated.body.token);
      res.status(200).json({ success: true, data: result });
    },

    async resendVerification(req, res) {
      const result = await authService.resendVerification(
        req.validated.body.email,
      );
      res.status(202).json({ success: true, data: result });
    },

    async forgotPassword(req, res) {
      const result = await authService.forgotPassword(req.validated.body.email);
      res.status(202).json({ success: true, data: result });
    },

    async resetPassword(req, res) {
      const result = await authService.resetPassword(
        req.validated.body,
        requestContext(req),
      );
      res.status(200).json({ success: true, data: result });
    },

    async refresh(req, res) {
      const input = req.validated.body;
      const cookieRefreshToken = req.cookies[config.refreshCookieName];
      const refreshToken = input.refreshToken || cookieRefreshToken;

      if (!refreshToken) {
        throw new AppError({
          statusCode: 401,
          code: "REFRESH_TOKEN_REQUIRED",
          message: "Refresh token is required",
        });
      }

      let result;

      try {
        result = await authService.refresh(
          refreshToken,
          requestContext(req, {
            deviceName: input.deviceName,
            platform: input.platform,
          }),
        );
      } catch (error) {
        if (cookieRefreshToken) {
          res.clearCookie(
            config.refreshCookieName,
            refreshCookieBaseOptions(config),
          );
        }
        throw error;
      }
      res.status(200).json({
        success: true,
        data: sendSession(
          req,
          res,
          result,
          input.platform,
          config,
          Boolean(cookieRefreshToken && !input.refreshToken),
        ),
      });
    },

    async logout(req, res) {
      const refreshToken =
        req.validated.body.refreshToken ||
        req.cookies[config.refreshCookieName];
      const result = await authService.logout({
        refreshToken,
        accessToken: readBearerToken(req),
      });
      res.clearCookie(
        config.refreshCookieName,
        refreshCookieBaseOptions(config),
      );
      res.status(200).json({ success: true, data: result });
    },

    async logoutAll(req, res) {
      const result = await authService.logoutAll(req.auth.userId);
      res.clearCookie(
        config.refreshCookieName,
        refreshCookieBaseOptions(config),
      );
      res.status(200).json({ success: true, data: result });
    },

    async accountClosureRequirements(req, res) {
      const result = await authService.accountClosureRequirements(
        req.auth.userId,
      );
      res.status(200).json({ success: true, data: result });
    },

    async closeAccount(req, res) {
      const result = await authService.closeAccount(
        req.auth.userId,
        req.validated.body,
        requestContext(req),
      );
      res.clearCookie(
        config.refreshCookieName,
        refreshCookieBaseOptions(config),
      );
      res.status(200).json({ success: true, data: result });
    },
  });
}
