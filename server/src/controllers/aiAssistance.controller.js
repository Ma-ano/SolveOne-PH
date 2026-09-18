export function createAiAssistanceController(service) {
  return Object.freeze({
    async status(req, res) {
      res.set("Cache-Control", "private, no-store");
      res.status(200).json({ success: true, data: service.status() });
    },
    async structureRequest(req, res) {
      const result = await service.structureRequest(
        req.auth.userId,
        req.validated.body,
      );
      res.status(200).json({ success: true, data: result });
    },
  });
}
