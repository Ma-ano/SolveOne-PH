export function serializeNotification(notification) {
  return {
    id: String(notification._id ?? notification.id),
    kind: notification.kind,
    resourceType: notification.resourceType,
    resourceId: String(notification.resourceId),
    requestId: notification.requestId ? String(notification.requestId) : null,
    createdAt: notification.createdAt,
    readAt: notification.readAt ?? null,
  };
}
