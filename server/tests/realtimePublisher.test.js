import { describe, expect, it } from "vitest";

import { RealtimePublisher } from "../src/realtime/RealtimePublisher.js";

describe("realtime publisher", () => {
  it("publishes only identifiers after persistence to derived rooms", () => {
    const emissions = [];
    const io = {
      to(room) {
        return {
          emit(event, payload) {
            emissions.push({ room, event, payload });
          },
        };
      },
    };
    const publisher = new RealtimePublisher();
    publisher.attach(io);
    publisher.publishMessage({
      conversation: {
        _id: "111111111111111111111111",
        participants: ["222222222222222222222222", "333333333333333333333333"],
      },
      message: { _id: "444444444444444444444444", content: "private" },
    });

    expect(emissions).toHaveLength(3);
    expect(emissions[0]).toEqual({
      room: "conversation:111111111111111111111111",
      event: "message:created",
      payload: {
        conversationId: "111111111111111111111111",
        messageId: "444444444444444444444444",
      },
    });
    expect(JSON.stringify(emissions)).not.toContain("private");
  });

  it("delivers notification hints only to the derived recipient room", () => {
    const emissions = [];
    const publisher = new RealtimePublisher();
    publisher.attach({
      to(room) {
        return {
          emit(event, payload) {
            emissions.push({ room, event, payload });
          },
        };
      },
    });
    const recipientId = "111111111111111111111111";
    const notificationId = "222222222222222222222222";
    publisher.publishNotification({ recipientId, notificationId });
    publisher.publishNotificationRead({ recipientId, notificationId });
    publisher.publishNotificationsReadAll({ recipientId });
    expect(emissions).toEqual([
      {
        room: `user:${recipientId}`,
        event: "notification:created",
        payload: { notificationId },
      },
      {
        room: `user:${recipientId}`,
        event: "notification:read",
        payload: { notificationId },
      },
      {
        room: `user:${recipientId}`,
        event: "notification:read-all",
        payload: {},
      },
    ]);
    expect(JSON.stringify(emissions)).not.toContain("message text");
  });
});
