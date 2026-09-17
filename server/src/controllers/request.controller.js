export function createRequestController(requestService) {
  return Object.freeze({
    async createDraft(req, res) {
      const result = await requestService.createDraft(
        req.auth.userId,
        req.validated.body,
      );
      res.status(201).json({ success: true, data: result });
    },

    async updateDraft(req, res) {
      const result = await requestService.updateDraft(
        req.auth.userId,
        req.validated.params.requestId,
        req.validated.body,
      );
      res.status(200).json({ success: true, data: result });
    },

    async submit(req, res) {
      const result = await requestService.submit(
        req.auth.userId,
        req.validated.params.requestId,
      );
      res.status(200).json({ success: true, data: result });
    },

    async cancel(req, res) {
      const result = await requestService.cancel(
        req.auth.userId,
        req.validated.params.requestId,
      );
      res.status(200).json({ success: true, data: result });
    },

    async getRequest(req, res) {
      const result = await requestService.getRequest(
        req.validated.params.requestId,
        req.auth?.userId,
      );
      res.status(200).json({ success: true, data: result });
    },

    async listPublic(req, res) {
      const result = await requestService.listPublic(req.validated.query);
      res.status(200).json({ success: true, data: result });
    },

    async discover(req, res) {
      const result = await requestService.discover(
        req.auth?.userId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },

    async solvable(req, res) {
      const result = await requestService.solvable(
        req.auth?.userId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },

    async listOwned(req, res) {
      const result = await requestService.listOwned(
        req.auth.userId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },

    async listForModeration(req, res) {
      const result = await requestService.listForModeration(
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },

    async approve(req, res) {
      const result = await requestService.moderate(
        req.auth.userId,
        req.validated.params.requestId,
        "approve",
        null,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },

    async reject(req, res) {
      const result = await requestService.moderate(
        req.auth.userId,
        req.validated.params.requestId,
        "reject",
        req.validated.body.notes,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },

    async requestChanges(req, res) {
      const result = await requestService.moderate(
        req.auth.userId,
        req.validated.params.requestId,
        "requestChanges",
        req.validated.body.notes,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
  });
}
