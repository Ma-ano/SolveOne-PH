import { randomUUID } from "node:crypto";

import jwt from "jsonwebtoken";

import { AppError } from "../utils/AppError.js";

const issuer = "solveone-api";
const audience = "solveone-client";

function verifyToken(token, secret, expectedType, errorCode) {
  try {
    const claims = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      issuer,
      audience,
    });

    if (
      claims.type !== expectedType ||
      typeof claims.sub !== "string" ||
      !claims.sid
    ) {
      throw new Error("Token claims are invalid");
    }

    return claims;
  } catch (error) {
    throw new AppError({
      statusCode: 401,
      code: errorCode,
      message: "Authentication token is invalid or expired",
      cause: error,
    });
  }
}

export function createTokenService(config) {
  return Object.freeze({
    issueAccessToken({ userId, sessionId }) {
      return jwt.sign(
        { type: "access", sid: sessionId },
        config.jwtAccessSecret,
        {
          algorithm: "HS256",
          audience,
          issuer,
          subject: String(userId),
          jwtid: randomUUID(),
          expiresIn: config.accessTokenTtlMinutes * 60,
        },
      );
    },

    issueRefreshToken({ userId, sessionId, familyId }) {
      return jwt.sign(
        { type: "refresh", sid: sessionId, fid: familyId },
        config.jwtRefreshSecret,
        {
          algorithm: "HS256",
          audience,
          issuer,
          subject: String(userId),
          jwtid: randomUUID(),
          expiresIn: config.refreshTokenTtlDays * 24 * 60 * 60,
        },
      );
    },

    verifyAccessToken(token) {
      return verifyToken(
        token,
        config.jwtAccessSecret,
        "access",
        "ACCESS_TOKEN_INVALID",
      );
    },

    verifyRefreshToken(token) {
      const claims = verifyToken(
        token,
        config.jwtRefreshSecret,
        "refresh",
        "REFRESH_TOKEN_INVALID",
      );

      if (typeof claims.fid !== "string") {
        throw new AppError({
          statusCode: 401,
          code: "REFRESH_TOKEN_INVALID",
          message: "Authentication token is invalid or expired",
        });
      }

      return claims;
    },
  });
}
