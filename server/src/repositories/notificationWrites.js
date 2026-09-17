import { Notification } from "../models/Notification.js";

const retentionMs = 180 * 24 * 60 * 60 * 1000;

export async function createNotification({
  recipientId,
  kind,
  resourceType,
  resourceId,
  eventId = resourceId,
  requestId = null,
  now,
  session,
}) {
  const [created] = await Notification.create(
    [
      {
        recipientId,
        kind,
        resourceType,
        resourceId,
        requestId,
        eventKey: `${kind}:${eventId}:${recipientId}`,
        expiresAt: new Date(now.getTime() + retentionMs),
        createdAt: now,
      },
    ],
    { session },
  );
  return created.toObject();
}
