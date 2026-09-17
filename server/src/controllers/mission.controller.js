export function createMissionController(service) {
  return Object.freeze({
    async create(req, res) {
      const result = await service.create(
        req.auth.userId,
        req.validated.body,
        req.idempotencyKey,
      );
      res.status(201).json({ success: true, data: result });
    },
    async update(req, res) {
      const result = await service.update(
        req.auth.userId,
        req.validated.params.missionId,
        req.validated.body,
      );
      res.status(200).json({ success: true, data: result });
    },
    async submit(req, res) {
      const result = await service.submit(
        req.auth.userId,
        req.validated.params.missionId,
      );
      res.status(200).json({ success: true, data: result });
    },
    async get(req, res) {
      const result = await service.get(
        req.validated.params.missionId,
        req.auth?.userId,
      );
      res.status(200).json({ success: true, data: result });
    },
    async list(req, res) {
      res.status(200).json({
        success: true,
        data: await service.listPublic(req.validated.query),
      });
    },
    async mine(req, res) {
      res.status(200).json({
        success: true,
        data: await service.listOwned(req.auth.userId, req.validated.query),
      });
    },
    async matches(req, res) {
      res.status(200).json({
        success: true,
        data: await service.matches(req.auth.userId, req.validated.query),
      });
    },
    async moderationQueue(req, res) {
      res.status(200).json({
        success: true,
        data: await service.listForModeration(req.validated.query),
      });
    },
    async approve(req, res) {
      const result = await service.moderate(
        req.auth,
        req.validated.params.missionId,
        "approve",
        null,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async reject(req, res) {
      const result = await service.moderate(
        req.auth,
        req.validated.params.missionId,
        "reject",
        req.validated.body.notes,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async requestChanges(req, res) {
      const result = await service.moderate(
        req.auth,
        req.validated.params.missionId,
        "requestChanges",
        req.validated.body.notes,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async contribute(req, res) {
      const result = await service.contribute(
        req.auth.userId,
        req.validated.params.missionId,
        req.validated.body,
        req.idempotencyKey,
      );
      res.status(201).json({ success: true, data: result });
    },
    async contributions(req, res) {
      res.status(200).json({
        success: true,
        data: await service.listContributions(
          req.auth.userId,
          req.validated.params.missionId,
          req.validated.query,
        ),
      });
    },
    async myContributions(req, res) {
      res.status(200).json({
        success: true,
        data: await service.listContributions(
          req.auth.userId,
          null,
          req.validated.query,
        ),
      });
    },
    async accept(req, res) {
      const result = await service.accept(
        req.auth.userId,
        req.validated.params.contributionId,
        req.idempotencyKey,
      );
      res.status(200).json({ success: true, data: result });
    },
    async rejectContribution(req, res) {
      const result = await service.transition(
        req.auth.userId,
        req.validated.params.contributionId,
        "reject",
      );
      res.status(200).json({ success: true, data: result });
    },
    async withdraw(req, res) {
      const result = await service.transition(
        req.auth.userId,
        req.validated.params.contributionId,
        "withdraw",
      );
      res.status(200).json({ success: true, data: result });
    },
    async start(req, res) {
      const result = await service.transition(
        req.auth.userId,
        req.validated.params.contributionId,
        "start",
      );
      res.status(200).json({ success: true, data: result });
    },
    async complete(req, res) {
      const result = await service.complete(
        req.auth.userId,
        req.validated.params.contributionId,
        req.validated.body,
        req.idempotencyKey,
      );
      res.status(200).json({ success: true, data: result });
    },
    async confirm(req, res) {
      const result = await service.confirm(
        req.auth.userId,
        req.validated.params.contributionId,
        req.idempotencyKey,
      );
      res.status(200).json({ success: true, data: result });
    },
    async cancel(req, res) {
      const result = await service.cancel(
        req.auth.userId,
        req.validated.params.missionId,
      );
      res.status(200).json({ success: true, data: result });
    },
  });
}
