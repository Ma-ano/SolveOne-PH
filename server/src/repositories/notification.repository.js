import { Notification } from "../models/Notification.js";

function withCursor(filter, cursor) {
  if (!cursor) return filter;
  return {
    ...filter,
    $or: [
      { createdAt: { $lt: cursor.date } },
      { createdAt: cursor.date, _id: { $lt: cursor.id } },
    ],
  };
}

export class NotificationRepository {
  async list({ recipientId, unreadOnly, cursor, limit }) {
    const rows = await Notification.find(
      withCursor(
        { recipientId, ...(unreadOnly ? { readAt: null } : {}) },
        cursor,
      ),
    )
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();
    return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
  }

  countUnread(recipientId) {
    return Notification.countDocuments({ recipientId, readAt: null });
  }

  async markRead({ recipientId, notificationId, now }) {
    const changed = await Notification.findOneAndUpdate(
      { _id: notificationId, recipientId, readAt: null },
      { $set: { readAt: now } },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (changed) return { notification: changed, changed: true };
    const existing = await Notification.findOne({
      _id: notificationId,
      recipientId,
    })
      .lean()
      .exec();
    return { notification: existing, changed: false };
  }

  async markAllRead({ recipientId, now }) {
    const result = await Notification.updateMany(
      { recipientId, readAt: null },
      { $set: { readAt: now } },
      { runValidators: true },
    );
    return result.modifiedCount;
  }
}
