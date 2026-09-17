import { describe, expect, it } from "vitest";

import { HelpOffer } from "../src/models/HelpOffer.js";
import { HelpRequest } from "../src/models/HelpRequest.js";
import { IdempotencyRecord } from "../src/models/IdempotencyRecord.js";
import { CompletionEvidence } from "../src/models/CompletionEvidence.js";
import { EvidenceUpload } from "../src/models/EvidenceUpload.js";
import { UserBlock } from "../src/models/UserBlock.js";

describe("offer persistence models", () => {
  it("defines bounded minor-unit, quantity, and duration fields", () => {
    expect(HelpOffer.schema.path("message").options.maxlength).toBe(1000);
    expect(HelpOffer.schema.path("quantity").options.max).toBe(10000);
    expect(HelpOffer.schema.path("pledgedValueCentavos").options.min).toBe(0);
    expect(HelpOffer.schema.path("estimatedMinutes").options.max).toBe(10080);
    expect(HelpOffer.schema.path("activeKey").options.select).toBe(false);
  });

  it("has request, helper, and active-relationship indexes", () => {
    const indexes = HelpOffer.schema.indexes();
    const names = indexes.map(([, options]) => options.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "offer_request_status",
        "offer_helper_created",
        "offer_active_relationship_unique",
      ]),
    );
    const activeIndex = indexes.find(
      ([, options]) => options.name === "offer_active_relationship_unique",
    );
    expect(activeIndex[1]).toMatchObject({ unique: true });
  });

  it("stores reservation and completion counters separately", () => {
    for (const path of [
      "needItems.reservedQuantity",
      "needItems.solvedQuantity",
      "needItems.reservedValueCentavos",
      "needItems.solvedValueCentavos",
    ]) {
      expect(HelpRequest.schema.path(path)).toBeTruthy();
    }
  });

  it("defines directional block indexes for relationship enforcement", () => {
    const names = UserBlock.schema.indexes().map(([, options]) => options.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "user_block_unique",
        "user_block_reverse_lookup",
      ]),
    );
  });

  it("deduplicates idempotency keys by principal and operation with expiry", () => {
    const indexes = IdempotencyRecord.schema.indexes();
    expect(
      indexes.find(
        ([, options]) => options.name === "idempotency_scope_unique",
      )[1].unique,
    ).toBe(true);
    expect(
      indexes.find(([, options]) => options.name === "idempotency_ttl")[1]
        .expireAfterSeconds,
    ).toBe(0);
    expect(IdempotencyRecord.schema.path("responseBody").options.select).toBe(
      false,
    );
  });

  it("keeps completion evidence private and unique to one offer", () => {
    expect(
      CompletionEvidence.schema.path("files").options.validate.validator([]),
    ).toBe(true);
    expect(
      CompletionEvidence.schema
        .path("files")
        .options.validate.validator(Array(5)),
    ).toBe(false);
    expect(
      CompletionEvidence.schema
        .indexes()
        .find(
          ([, options]) => options.name === "completion_evidence_offer_unique",
        )[1].unique,
    ).toBe(true);
    expect(HelpOffer.schema.path("completionSubmittedAt")).toBeTruthy();
    expect(EvidenceUpload.schema.path("key").options.select).toBe(false);
    expect(
      EvidenceUpload.schema.indexes().map(([, options]) => options.name),
    ).toContain("evidence_upload_cleanup_queue");
  });
});
