import mongoose from "mongoose";
import { describe, expect, it, vi } from "vitest";

import { NOTIFICATION_KINDS } from "../src/constants/statuses.js";
import { Notification } from "../src/models/Notification.js";
import { createNotificationIndexes } from "../src/jobs/createNotificationIndexes.js";
import { createNotification } from "../src/repositories/notificationWrites.js";
import { serializeNotification } from "../src/serializers/notification.serializer.js";

const recipientId = new mongoose.Types.ObjectId("111111111111111111111111");
const resourceId = new mongoose.Types.ObjectId("222222222222222222222222");
const eventId = new mongoose.Types.ObjectId("333333333333333333333333");

describe("notification persistence", () => {
  it("indexes each recipient's ordered inbox, unread state, unique events, and expiry", () => {
    const indexes = Notification.schema.indexes();
    expect(indexes.map(([, options]) => options.name)).toEqual(
      expect.arrayContaining([
        "notification_recipient_created",
        "notification_recipient_unread",
        "notification_event_unique",
        "notification_expiry_ttl",
      ]),
    );
    expect(
      indexes.find(
        ([, options]) => options.name === "notification_event_unique",
      )[1].unique,
    ).toBe(true);
    expect(
      indexes.find(
        ([, options]) => options.name === "notification_expiry_ttl",
      )[1].expireAfterSeconds,
    ).toBe(0);
    expect(Notification.schema.path("eventKey").options.select).toBe(false);
    expect(Notification.schema.path("recipientId").options.immutable).toBe(
      true,
    );
  });

  it("rejects unknown kinds and contains no plaintext message field", async () => {
    expect(NOTIFICATION_KINDS).toContain("message_received");
    expect(Notification.schema.path("content")).toBeUndefined();
    const invalid = new Notification({
      recipientId,
      kind: "private_message_text",
      resourceType: "conversation",
      resourceId,
      eventKey: "invalid",
      expiresAt: new Date("2027-01-01"),
    });
    await expect(invalid.validate()).rejects.toThrow();
  });

  it("writes an event-specific dedupe key in the caller's transaction", async () => {
    const create = vi
      .spyOn(Notification, "create")
      .mockResolvedValueOnce([
        { toObject: () => ({ _id: eventId, recipientId }) },
      ]);
    const now = new Date("2026-09-16T00:00:00.000Z");
    const session = { transaction: true };
    try {
      await createNotification({
        recipientId,
        kind: "message_received",
        resourceType: "conversation",
        resourceId,
        eventId,
        now,
        session,
      });
      expect(create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            eventKey: `message_received:${eventId}:${recipientId}`,
            resourceId,
            recipientId,
            expiresAt: new Date("2027-03-15T00:00:00.000Z"),
          }),
        ],
        { session },
      );
    } finally {
      create.mockRestore();
    }
  });

  it("serializes only safe, navigation-ready identifiers", () => {
    const output = serializeNotification({
      _id: eventId,
      recipientId,
      kind: "message_received",
      resourceType: "conversation",
      resourceId,
      requestId: null,
      readAt: null,
      createdAt: new Date("2026-09-16"),
      eventKey: "hidden",
      content: "private message text",
    });
    expect(output).toEqual({
      id: String(eventId),
      kind: "message_received",
      resourceType: "conversation",
      resourceId: String(resourceId),
      requestId: null,
      createdAt: new Date("2026-09-16"),
      readAt: null,
    });
    expect(JSON.stringify(output)).not.toContain("private");
  });

  it("has an operator-run, create-only production index step", async () => {
    const createIndexes = vi
      .fn()
      .mockResolvedValue(["notification_event_unique"]);
    expect(await createNotificationIndexes({ createIndexes })).toEqual([
      "notification_event_unique",
    ]);
    expect(createIndexes).toHaveBeenCalledOnce();
  });
});
