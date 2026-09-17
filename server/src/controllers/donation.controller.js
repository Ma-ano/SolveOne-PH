export function createDonationController(service) {
  return Object.freeze({
    async checkout(req, res) {
      const result = await service.createCheckout(
        req.auth.userId,
        req.validated.body,
        req.idempotencyKey,
      );
      res
        .status(result.replayed ? 200 : 201)
        .json({ success: true, data: result });
    },
    async history(req, res) {
      const result = await service.history(
        req.auth.userId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },
    async dashboard(req, res) {
      const result = await service.dashboard(req.auth, req.ip);
      res.status(200).json({ success: true, data: result });
    },
    async webhook(req, res) {
      const result = await service.webhook(
        req.body,
        req.get("Paymongo-Signature"),
      );
      res.status(200).json({ success: true, data: result });
    },
  });
}
