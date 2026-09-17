import { describe, expect, it, vi } from "vitest";

import { createPrivacyRequestIndexes } from "../src/jobs/createPrivacyRequestIndexes.js";
import { DataSubjectRequest } from "../src/models/DataSubjectRequest.js";

describe("privacy-request persistence", () => {
  it("protects assignment fields and deduplicates active requests by type", () => {
    expect(
      DataSubjectRequest.schema.path("assignedAdminId").options.select,
    ).toBe(false);
    expect(DataSubjectRequest.schema.path("resolvedBy").options.select).toBe(
      false,
    );
    expect(DataSubjectRequest.schema.path("activeKey").options.select).toBe(
      false,
    );
    expect(DataSubjectRequest.schema.path("details").options.immutable).toBe(
      true,
    );
    const active = DataSubjectRequest.schema
      .indexes()
      .find(
        ([, options]) => options.name === "data_subject_request_active_unique",
      );
    expect(active[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { activeKey: { $type: "string" } },
    });
  });

  it("has an operator-run index command", async () => {
    const requestModel = { createIndexes: vi.fn(async () => true) };
    const auditModel = { createIndexes: vi.fn(async () => true) };
    await createPrivacyRequestIndexes(requestModel, auditModel);
    expect(requestModel.createIndexes).toHaveBeenCalledOnce();
    expect(auditModel.createIndexes).toHaveBeenCalledOnce();
  });
});
