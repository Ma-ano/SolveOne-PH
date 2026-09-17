export function createNotificationController(service) {
  return Object.freeze({
    async list(req, res) {
      const result = await service.list(req.auth.userId, req.validated.query);
      res.status(200).json({ success: true, data: result });
    },
    async unreadCount(req, res) {
      const result = await service.unreadCount(req.auth.userId);
      res.status(200).json({ success: true, data: result });
    },
    async markRead(req, res) {
      const result = await service.markRead(
        req.auth.userId,
        req.validated.params.notificationId,
      );
      res.status(200).json({ success: true, data: result });
    },
    async markAllRead(req, res) {
      const result = await service.markAllRead(req.auth.userId);
      res.status(200).json({ success: true, data: result });
    },
  });
}
