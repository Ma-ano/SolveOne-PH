export function createGiveawayController(service) {
  return Object.freeze({
    async create(req, res) {
      const result = await service.create(
        req.auth.userId,
        req.validated.body,
        req.idempotencyKey,
      );
      res.status(201).json({ success: true, data: result });
    },
    async listPublic(req, res) {
      const result = await service.listPublic(req.validated.query);
      res.status(200).json({ success: true, data: result });
    },
    async listMine(req, res) {
      const result = await service.listMine(
        req.auth.userId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },
    async get(req, res) {
      const result = await service.get(
        req.validated.params.itemId,
        req.auth?.userId,
      );
      res.status(200).json({ success: true, data: result });
    },
    async matches(req, res) {
      const result = await service.matches(
        req.auth.userId,
        req.validated.params.itemId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },
    async reserve(req, res) {
      const result = await service.reserve(
        req.auth.userId,
        req.validated.params.itemId,
        req.validated.body,
        req.idempotencyKey,
      );
      res.status(201).json({ success: true, data: result });
    },
    async remove(req, res) {
      const result = await service.remove(
        req.auth.userId,
        req.validated.params.itemId,
      );
      res.status(200).json({ success: true, data: result });
    },
    async reservations(req, res) {
      const result = await service.reservations(
        req.auth.userId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },
    async confirm(req, res) {
      const result = await service.confirm(
        req.auth.userId,
        req.validated.params.reservationId,
        req.idempotencyKey,
      );
      res.status(200).json({ success: true, data: result });
    },
    async cancel(req, res) {
      const result = await service.cancel(
        req.auth.userId,
        req.validated.params.reservationId,
      );
      res.status(200).json({ success: true, data: result });
    },
  });
}
