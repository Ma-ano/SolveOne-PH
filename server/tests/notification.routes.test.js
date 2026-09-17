import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createNotificationController } from "../src/controllers/notification.controller.js";
import { createNotificationRouter } from "../src/routes/notification.routes.js";
import { NotificationService } from "../src/services/notification.service.js";
import { AppError } from "../src/utils/AppError.js";
import { notificationSchemas } from "../src/validators/notification.schemas.js";
import { createTestApp } from "./helpers/createTestApp.js";

const alice = "111111111111111111111111";
const bob = "222222222222222222222222";
const firstId = "333333333333333333333333";
const secondId = "444444444444444444444444";
const bobId = "555555555555555555555555";

function item(_id, recipientId, createdAt, readAt = null) {
  return {
    _id,
    recipientId,
    kind: "message_received",
    resourceType: "conversation",
    resourceId: "666666666666666666666666",
    requestId: null,
    createdAt: new Date(createdAt),
    readAt,
  };
}

class FakeNotificationRepository {
  constructor() {
    this.items = [
      item(firstId, alice, "2026-09-16T10:00:00.000Z"),
      item(secondId, alice, "2026-09-16T09:00:00.000Z"),
      item(bobId, bob, "2026-09-16T11:00:00.000Z"),
    ];
  }

  async list({ recipientId, unreadOnly, cursor, limit }) {
    const rows = this.items
      .filter((row) => String(row.recipientId) === String(recipientId))
      .filter((row) => !unreadOnly || !row.readAt)
      .filter(
        (row) =>
          !cursor ||
          row.createdAt < cursor.date ||
          (row.createdAt.getTime() === cursor.date.getTime() &&
            row._id < cursor.id),
      )
      .sort(
        (left, right) =>
          right.createdAt - left.createdAt || right._id.localeCompare(left._id),
      );
    return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
  }

  async countUnread(recipientId) {
    return this.items.filter(
      (row) => String(row.recipientId) === String(recipientId) && !row.readAt,
    ).length;
  }

  async markRead({ recipientId, notificationId, now }) {
    const notification = this.items.find(
      (row) =>
        row._id === notificationId &&
        String(row.recipientId) === String(recipientId),
    );
    if (!notification) return { notification: null, changed: false };
    const changed = !notification.readAt;
    if (changed) notification.readAt = now;
    return { notification, changed };
  }

  async markAllRead({ recipientId, now }) {
    let count = 0;
    for (const notification of this.items) {
      if (notification.recipientId === recipientId && !notification.readAt) {
        notification.readAt = now;
        count += 1;
      }
    }
    return count;
  }
}

function harness() {
  const repository = new FakeNotificationRepository();
  const publisher = {
    publishNotificationRead: vi.fn(),
    publishNotificationsReadAll: vi.fn(),
  };
  const service = new NotificationService({
    repository,
    publisher,
    clock: () => new Date("2026-09-16T12:00:00.000Z"),
  });
  const authService = {
    async authenticateAccessToken(token) {
      if (token === "alice") return { userId: alice };
      if (token === "bob") return { userId: bob };
      throw new AppError({
        statusCode: 401,
        code: "AUTH_REQUIRED",
        message: "Authentication is required",
      });
    },
  };
  const router = createNotificationRouter({
    controller: createNotificationController(service),
    schemas: notificationSchemas,
    authService,
  });
  const app = createTestApp({}, { notificationRouter: router });
  return { app, publisher, repository, service };
}

describe("notification API", () => {
  it("requires a valid account session and rejects invalid IDs and mass assignment", async () => {
    const { app } = harness();
    const anonymous = await request(app).get("/api/v1/notifications");
    expect(anonymous.status).toBe(401);
    const invalid = await request(app)
      .post("/api/v1/notifications/not-an-id/read")
      .set("Authorization", "Bearer alice")
      .send({});
    expect(invalid.status).toBe(422);
    const massAssignment = await request(app)
      .post(`/api/v1/notifications/${firstId}/read`)
      .set("Authorization", "Bearer alice")
      .send({ recipientId: bob });
    expect(massAssignment.status).toBe(422);
  });

  it("returns a paginated, recipient-scoped inbox with a scoped cursor", async () => {
    const { app } = harness();
    const first = await request(app)
      .get("/api/v1/notifications?limit=1")
      .set("Authorization", "Bearer alice");
    expect(first.status).toBe(200);
    expect(first.body.data.items.map((row) => row.id)).toEqual([firstId]);
    expect(first.body.data.pageInfo.hasNextPage).toBe(true);
    const cursor = first.body.data.pageInfo.nextCursor;
    const next = await request(app)
      .get(`/api/v1/notifications?limit=1&cursor=${cursor}`)
      .set("Authorization", "Bearer alice");
    expect(next.body.data.items.map((row) => row.id)).toEqual([secondId]);
    const crossScope = await request(app)
      .get(`/api/v1/notifications?limit=1&cursor=${cursor}`)
      .set("Authorization", "Bearer bob");
    expect(crossScope.status).toBe(400);
    const other = await request(app)
      .get("/api/v1/notifications")
      .set("Authorization", "Bearer bob");
    expect(other.body.data.items.map((row) => row.id)).toEqual([bobId]);
  });

  it("supports unread-only views and count without exposing another account", async () => {
    const { app } = harness();
    const count = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", "Bearer alice");
    expect(count.body.data.unreadCount).toBe(2);
    const unread = await request(app)
      .get("/api/v1/notifications?unreadOnly=true")
      .set("Authorization", "Bearer alice");
    expect(unread.body.data.items).toHaveLength(2);
    const invalid = await request(app)
      .get("/api/v1/notifications?unreadOnly=maybe")
      .set("Authorization", "Bearer alice");
    expect(invalid.status).toBe(422);
  });

  it("marks only the recipient's notification read and does not rebroadcast replay", async () => {
    const { app, publisher } = harness();
    const forbidden = await request(app)
      .post(`/api/v1/notifications/${bobId}/read`)
      .set("Authorization", "Bearer alice")
      .send({});
    expect(forbidden.status).toBe(404);
    const first = await request(app)
      .post(`/api/v1/notifications/${firstId}/read`)
      .set("Authorization", "Bearer alice")
      .send({});
    expect(first.status).toBe(200);
    expect(first.body.data.notification.readAt).toBeTruthy();
    const replay = await request(app)
      .post(`/api/v1/notifications/${firstId}/read`)
      .set("Authorization", "Bearer alice")
      .send({});
    expect(replay.status).toBe(200);
    expect(publisher.publishNotificationRead).toHaveBeenCalledOnce();
    expect(publisher.publishNotificationRead).toHaveBeenCalledWith({
      recipientId: alice,
      notificationId: firstId,
    });
  });

  it("marks all of one account read without touching another account", async () => {
    const { app, publisher } = harness();
    const first = await request(app)
      .post("/api/v1/notifications/read-all")
      .set("Authorization", "Bearer alice")
      .send({});
    expect(first.body.data.modifiedCount).toBe(2);
    const replay = await request(app)
      .post("/api/v1/notifications/read-all")
      .set("Authorization", "Bearer alice")
      .send({});
    expect(replay.body.data.modifiedCount).toBe(0);
    expect(publisher.publishNotificationsReadAll).toHaveBeenCalledOnce();
    const aliceCount = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", "Bearer alice");
    const bobCount = await request(app)
      .get("/api/v1/notifications/unread-count")
      .set("Authorization", "Bearer bob");
    expect(aliceCount.body.data.unreadCount).toBe(0);
    expect(bobCount.body.data.unreadCount).toBe(1);
  });
});
