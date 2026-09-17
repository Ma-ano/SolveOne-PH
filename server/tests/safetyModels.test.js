import { describe, expect, it, vi } from "vitest";

import { createSafetyIndexes } from "../src/jobs/createSafetyIndexes.js";
import { Report } from "../src/models/Report.js";
import { User } from "../src/models/User.js";
import { UserBlock } from "../src/models/UserBlock.js";

describe("safety persistence models", () => {
  it("deduplicates only active reports and supports expiring reviewer claims", () => {
    expect(Report.schema.path("activeKey").options.select).toBe(false);
    expect(Report.schema.path("conversationId").options.select).toBe(false);
    expect(Report.schema.path("reportedUserId").options.required).toBe(true);
    const unique = Report.schema
      .indexes()
      .find(([, options]) => options.name === "report_active_unique");
    expect(unique[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { activeKey: { $type: "string" } },
    });
    expect(
      Report.schema
        .indexes()
        .some(([, options]) => options.name === "report_moderator_claims"),
    ).toBe(true);
  });

  it("keeps suspension reasons and actors out of default user reads", () => {
    for (const field of [
      "suspendedAt",
      "suspendedBy",
      "suspensionReason",
      "reinstatedAt",
      "reinstatedBy",
    ]) {
      expect(User.schema.path(field).options.select).toBe(false);
    }
  });

  it("enforces one directed block with a reverse relationship index", () => {
    const indexes = UserBlock.schema.indexes();
    expect(
      indexes.find(([, options]) => options.name === "user_block_unique")[1]
        .unique,
    ).toBe(true);
    expect(
      indexes.some(
        ([, options]) => options.name === "user_block_reverse_lookup",
      ),
    ).toBe(true);
  });

  it("replaces only the known legacy report index before creating safety indexes", async () => {
    const reportModel = {
      collection: {
        indexes: vi.fn(async () => [
          { name: "_id_" },
          { name: "report_active_unique", unique: true },
        ]),
        dropIndex: vi.fn(async () => true),
      },
      createIndexes: vi.fn(async () => true),
    };
    const blockModel = { createIndexes: vi.fn(async () => true) };
    const auditModel = { createIndexes: vi.fn(async () => true) };

    await createSafetyIndexes(reportModel, blockModel, auditModel);

    expect(reportModel.collection.dropIndex).toHaveBeenCalledWith(
      "report_active_unique",
    );
    expect(reportModel.createIndexes).toHaveBeenCalledOnce();
    expect(blockModel.createIndexes).toHaveBeenCalledOnce();
    expect(auditModel.createIndexes).toHaveBeenCalledOnce();
  });
});
