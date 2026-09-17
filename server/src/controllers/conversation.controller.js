export function createConversationController(conversationService) {
  return Object.freeze({
    async list(req, res) {
      const result = await conversationService.list(
        req.auth.userId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },
    async get(req, res) {
      const result = await conversationService.get(
        req.auth.userId,
        req.validated.params.conversationId,
      );
      res.status(200).json({ success: true, data: result });
    },
    async listMessages(req, res) {
      const result = await conversationService.listMessages(
        req.auth.userId,
        req.validated.params.conversationId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },
    async send(req, res) {
      const result = await conversationService.sendText(
        req.auth.userId,
        req.validated.params.conversationId,
        req.validated.body,
      );
      res
        .status(result.replayed ? 200 : 201)
        .json({ success: true, data: result });
    },
    async markRead(req, res) {
      const result = await conversationService.markRead(
        req.auth.userId,
        req.validated.params.conversationId,
        req.validated.body.messageId,
      );
      res.status(200).json({ success: true, data: result });
    },
    async reportMessage(req, res) {
      const result = await conversationService.reportMessage(
        req.auth.userId,
        req.validated.params.messageId,
        req.validated.body,
      );
      res
        .status(result.duplicate ? 200 : 201)
        .json({ success: true, data: result });
    },
  });
}
