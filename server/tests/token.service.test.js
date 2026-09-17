import { describe, expect, it } from "vitest";

import { createTokenService } from "../src/services/token.service.js";
import { authTestConfig } from "./helpers/createAuthFixture.js";

describe("token service", () => {
  it("issues short-lived access tokens with constrained claims", () => {
    const service = createTokenService(authTestConfig);
    const token = service.issueAccessToken({
      userId: "user-123",
      sessionId: "session-123",
    });
    const claims = service.verifyAccessToken(token);

    expect(claims).toMatchObject({
      sub: "user-123",
      sid: "session-123",
      type: "access",
      iss: "solveone-api",
      aud: "solveone-client",
    });
    expect(claims.exp - claims.iat).toBe(15 * 60);
  });

  it("issues refresh tokens with a family id and a separate secret", () => {
    const service = createTokenService(authTestConfig);
    const token = service.issueRefreshToken({
      userId: "user-123",
      sessionId: "session-123",
      familyId: "family-123",
    });

    expect(service.verifyRefreshToken(token)).toMatchObject({
      sub: "user-123",
      sid: "session-123",
      fid: "family-123",
      type: "refresh",
    });
    expect(() => service.verifyAccessToken(token)).toThrowError(
      expect.objectContaining({ code: "ACCESS_TOKEN_INVALID" }),
    );
  });

  it("rejects tampered tokens without exposing verification details", () => {
    const service = createTokenService(authTestConfig);
    const token = service.issueAccessToken({
      userId: "user-123",
      sessionId: "session-123",
    });
    const [header, payload, signature] = token.split(".");
    const tamperedSignature = `${signature.startsWith("a") ? "b" : "a"}${signature.slice(1)}`;
    const tampered = `${header}.${payload}.${tamperedSignature}`;

    expect(() => service.verifyAccessToken(tampered)).toThrowError(
      expect.objectContaining({
        code: "ACCESS_TOKEN_INVALID",
        message: "Authentication token is invalid or expired",
      }),
    );
  });
});
