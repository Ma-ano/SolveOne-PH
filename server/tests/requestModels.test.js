import { describe, expect, it, vi } from "vitest";

import { createDiscoveryIndexes } from "../src/jobs/createDiscoveryIndexes.js";
import { AuditLog } from "../src/models/AuditLog.js";
import { HelpRequest } from "../src/models/HelpRequest.js";

describe("help-request persistence models", () => {
  it("bounds request text and keeps safety flags private by default", () => {
    expect(HelpRequest.schema.path("title").options.maxlength).toBe(120);
    expect(HelpRequest.schema.path("description").options.maxlength).toBe(5000);
    expect(HelpRequest.schema.path("location.barangay").options.maxlength).toBe(
      120,
    );
    expect(HelpRequest.schema.path("safetyFlags").options.select).toBe(false);
    expect(
      HelpRequest.schema.path("needItems.estimatedMinutes").options,
    ).toMatchObject({ min: 15, max: 10080, default: null });
  });

  it("defines owner, public, moderation, and category listing indexes", () => {
    const names = HelpRequest.schema
      .indexes()
      .map(([, options]) => options.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "request_owner_updated",
        "request_public_listing",
        "request_moderation_queue",
        "request_public_category",
        "request_public_help_type",
        "request_public_urgency",
        "request_public_province_discovery",
        "request_public_skill_discovery",
      ]),
    );
  });

  it("has an operator-run, create-only discovery index step", async () => {
    const createIndexes = vi
      .fn()
      .mockResolvedValue([
        "request_public_province_discovery",
        "request_public_skill_discovery",
      ]);
    await expect(createDiscoveryIndexes({ createIndexes })).resolves.toEqual([
      "request_public_province_discovery",
      "request_public_skill_discovery",
    ]);
    expect(createIndexes).toHaveBeenCalledOnce();
  });

  it("makes audit content immutable and hides its IP hash by default", () => {
    for (const path of [
      "actorId",
      "action",
      "targetType",
      "targetId",
      "metadata",
      "ipHash",
    ]) {
      expect(AuditLog.schema.path(path).options.immutable).toBe(true);
    }
    expect(AuditLog.schema.path("ipHash").options.select).toBe(false);
  });
});
