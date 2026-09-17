import { describe, expect, it, vi } from "vitest";

import { ConversationService } from "../src/services/conversation.service.js";
import { OfferService } from "../src/services/offer.service.js";

const ownerId = "111111111111111111111111";
const helperId = "222222222222222222222222";
const offerId = "333333333333333333333333";
const requestId = "444444444444444444444444";
const conversationId = "555555555555555555555555";
const notificationId = "666666666666666666666666";

describe("notification publication after durable workflow results", () => {
  it("emits a completion hint only when the repository created a notification", async () => {
    const repository = {
      submitCompletion: vi
        .fn()
        .mockResolvedValueOnce({
          outcome: "submitted",
          offer: {
            _id: offerId,
            requestId,
            helperId,
            needItemId: requestId,
            helpType: "item",
            message: "Delivered one item",
            status: "completion_submitted",
          },
          evidence: { offerId, submittedBy: helperId, note: "Delivered" },
          notification: { _id: notificationId, recipientId: ownerId },
        })
        .mockResolvedValueOnce({
          outcome: "submitted",
          offer: {
            _id: offerId,
            requestId,
            helperId,
            needItemId: requestId,
            helpType: "item",
            message: "Delivered one item",
            status: "completion_submitted",
          },
          evidence: { offerId, submittedBy: helperId, note: "Delivered" },
          notification: null,
        }),
    };
    const publisher = { publishNotification: vi.fn() };
    const service = new OfferService({ repository, config: {}, publisher });
    await service.complete(helperId, offerId, { note: "Delivered" });
    await service.complete(helperId, offerId, { note: "Delivered" });
    expect(publisher.publishNotification).toHaveBeenCalledOnce();
    expect(publisher.publishNotification).toHaveBeenCalledWith({
      recipientId: ownerId,
      notificationId,
    });
  });

  it("does not send a second message hint for a sender-scoped replay", async () => {
    const message = {
      _id: offerId,
      conversationId,
      senderId: helperId,
      type: "text",
      content: "Private help message",
      createdAt: new Date("2026-09-16"),
    };
    const conversation = {
      _id: conversationId,
      participants: [ownerId, helperId],
    };
    const repository = {
      createTextMessage: vi
        .fn()
        .mockResolvedValueOnce({
          outcome: "created",
          message,
          conversation,
          notification: { _id: notificationId, recipientId: ownerId },
        })
        .mockResolvedValueOnce({
          outcome: "replayed",
          message,
          conversation,
          notification: null,
        }),
    };
    const publisher = {
      publishMessage: vi.fn(),
      publishNotification: vi.fn(),
    };
    const service = new ConversationService({ repository, publisher });
    await service.sendText(helperId, conversationId, {
      clientMessageId: "unique-message-client-id",
      content: message.content,
    });
    await service.sendText(helperId, conversationId, {
      clientMessageId: "unique-message-client-id",
      content: message.content,
    });
    expect(publisher.publishMessage).toHaveBeenCalledOnce();
    expect(publisher.publishNotification).toHaveBeenCalledOnce();
    expect(publisher.publishNotification).toHaveBeenCalledWith({
      recipientId: ownerId,
      notificationId,
    });
    expect(
      JSON.stringify(publisher.publishNotification.mock.calls),
    ).not.toContain(message.content);
  });
});
