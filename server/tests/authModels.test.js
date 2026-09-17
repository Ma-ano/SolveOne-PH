import { describe, expect, it } from "vitest";

import { AuthToken } from "../src/models/AuthToken.js";
import { RefreshSession } from "../src/models/RefreshSession.js";
import { SecurityEvent } from "../src/models/SecurityEvent.js";
import { User } from "../src/models/User.js";

function hasTtlIndex(model, field) {
  return model.schema
    .indexes()
    .some(
      ([keys, options]) =>
        keys[field] === 1 && options.expireAfterSeconds === 0,
    );
}

describe("authentication persistence models", () => {
  it("excludes credential and normalized identity fields by default", () => {
    expect(User.schema.path("passwordHash").options.select).toBe(false);
    expect(User.schema.path("emailNormalized").options.select).toBe(false);
    expect(RefreshSession.schema.path("tokenHash").options.select).toBe(false);
    expect(RefreshSession.schema.path("ipHash").options.select).toBe(false);
    expect(SecurityEvent.schema.path("ipHash").options.select).toBe(false);
  });

  it("declares unique identity and token indexes", () => {
    const userEmailIndex = User.schema
      .indexes()
      .find(([keys]) => keys.emailNormalized === 1);
    expect(userEmailIndex?.[1].unique).toBe(true);
    expect(RefreshSession.schema.path("sessionId").options.unique).toBe(true);
    expect(RefreshSession.schema.path("tokenHash").options.unique).toBe(true);
    expect(AuthToken.schema.path("tokenHash").options.unique).toBe(true);
  });

  it("expires refresh sessions and one-time tokens through TTL indexes", () => {
    expect(hasTtlIndex(RefreshSession, "expiresAt")).toBe(true);
    expect(hasTtlIndex(AuthToken, "expiresAt")).toBe(true);
  });

  it("defines bounded profile, skills, and private-location fields", () => {
    expect(User.schema.path("bio").options.maxlength).toBe(500);
    expect(User.schema.path("skills").options.default).toEqual([]);
    expect(User.schema.path("location.country").options.maxlength).toBe(80);
    expect(User.schema.path("location.barangay").options.maxlength).toBe(120);
    expect(User.schema.path("avatar.storageKey").options.select).toBe(false);
    expect(User.schema.path("accountClosedAt").options.select).toBe(false);
    expect(User.schema.path("accountClosurePolicyVersion").options.select).toBe(
      false,
    );
    expect(User.schema.path("avatar.mimeType").options.enum).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
  });
});
