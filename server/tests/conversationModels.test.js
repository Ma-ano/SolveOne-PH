import { describe, expect, it } from "vitest";

import { Conversation } from "../src/models/Conversation.js";
import { Message } from "../src/models/Message.js";
import { Report } from "../src/models/Report.js";

describe("messaging persistence models", () => {
  it("enforces one relationship conversation and indexed participant activity", () => {
    const indexes = Conversation.schema.indexes();
    expect(
      indexes.find(
        ([, options]) => options.name === "conversation_offer_unique",
      )[1].unique,
    ).toBe(true);
    expect(
      indexes.some(
        ([, options]) => options.name === "conversation_participant_activity",
      ),
    ).toBe(true);
    expect(Conversation.schema.path("participants").options.immutable).toBe(
      true,
    );
  });

  it("bounds message content and deduplicates client message identifiers", () => {
    expect(Message.schema.path("content").options.maxlength).toBe(2000);
    expect(Message.schema.path("clientMessageId").options.select).toBe(false);
    expect(Message.schema.path("safetyFlags").options.select).toBe(false);
    const unique = Message.schema
      .indexes()
      .find(([, options]) => options.name === "message_sender_client_unique");
    expect(unique[1].unique).toBe(true);
  });

  it("keeps report routing metadata private and prevents report spam", () => {
    expect(Report.schema.path("conversationId").options.select).toBe(false);
    expect(Report.schema.path("activeKey").options.select).toBe(false);
    expect(Report.schema.path("reportedUserId").options.required).toBe(true);
    const unique = Report.schema
      .indexes()
      .find(([, options]) => options.name === "report_active_unique");
    expect(unique[1].unique).toBe(true);
  });
});
