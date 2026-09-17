import { serializeNotification } from "../serializers/notification.serializer.js";
import { AppError } from "../utils/AppError.js";
import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";

function notFound() {
  return new AppError({
    statusCode: 404,
    code: "NOTIFICATION_NOT_FOUND",
    message: "Notification not found",
  });
}

export class NotificationService {
  constructor({ repository, publisher, clock = () => new Date() }) {
    this.repository = repository;
    this.publisher = publisher;
    this.clock = clock;
  }

  async list(recipientId, query) {
    const scope = `notifications:${recipientId}:${query.unreadOnly}`;
    const page = await this.repository.list({
      recipientId,
      unreadOnly: query.unreadOnly,
      limit: query.limit,
      cursor: decodePageCursor(query.cursor, scope),
    });
    const last = page.items.at(-1);
    return {
      items: page.items.map(serializeNotification),
      pageInfo: {
        hasNextPage: page.hasNextPage,
        nextCursor:
          page.hasNextPage && last
            ? encodePageCursor({ scope, date: last.createdAt, id: last._id })
            : null,
      },
    };
  }

  async unreadCount(recipientId) {
    return { unreadCount: await this.repository.countUnread(recipientId) };
  }

  async markRead(recipientId, notificationId) {
    const result = await this.repository.markRead({
      recipientId,
      notificationId,
      now: this.clock(),
    });
    if (!result.notification) throw notFound();
    if (result.changed)
      this.publisher?.publishNotificationRead?.({ recipientId, notificationId });
    return { notification: serializeNotification(result.notification) };
  }

  async markAllRead(recipientId) {
    const modifiedCount = await this.repository.markAllRead({
      recipientId,
      now: this.clock(),
    });
    if (modifiedCount)
      this.publisher?.publishNotificationsReadAll?.({ recipientId });
    return { modifiedCount };
  }
}
