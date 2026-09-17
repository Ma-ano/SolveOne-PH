export function createOfferController(offerService) {
  return Object.freeze({
    async create(req, res) {
      const result = await offerService.create(
        req.auth.userId,
        req.validated.params.requestId,
        req.validated.body,
      );
      res.status(201).json({ success: true, data: result });
    },

    async listMine(req, res) {
      const result = await offerService.listMine(
        req.auth.userId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },

    async listForRequest(req, res) {
      const result = await offerService.listForRequest(
        req.auth.userId,
        req.validated.params.requestId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },

    async accept(req, res) {
      const result = await offerService.accept(
        req.auth.userId,
        req.validated.params.offerId,
        req.idempotencyKey,
      );
      res.status(200).json({ success: true, data: result });
    },

    async reject(req, res) {
      const result = await offerService.reject(
        req.auth.userId,
        req.validated.params.offerId,
      );
      res.status(200).json({ success: true, data: result });
    },

    async withdraw(req, res) {
      const result = await offerService.withdraw(
        req.auth.userId,
        req.validated.params.offerId,
      );
      res.status(200).json({ success: true, data: result });
    },

    async start(req, res) {
      const result = await offerService.start(
        req.auth.userId,
        req.validated.params.offerId,
      );
      res.status(200).json({ success: true, data: result });
    },

    async complete(req, res) {
      const result = await offerService.complete(
        req.auth.userId,
        req.validated.params.offerId,
        req.validated.body,
      );
      res.status(200).json({ success: true, data: result });
    },

    async confirm(req, res) {
      const result = await offerService.confirm(
        req.auth.userId,
        req.validated.params.offerId,
        req.idempotencyKey,
      );
      res.status(200).json({ success: true, data: result });
    },

    async dispute(req, res) {
      const result = await offerService.dispute(
        req.auth.userId,
        req.validated.params.offerId,
        req.validated.body,
      );
      res.status(200).json({ success: true, data: result });
    },

    async evidence(req, res) {
      const result = await offerService.evidence(
        req.auth.userId,
        req.validated.params.offerId,
      );
      res.status(200).json({ success: true, data: result });
    },

    async uploadEvidenceFile(req, res) {
      let name;
      try {
        name = decodeURIComponent(req.get("X-Evidence-Name") ?? "");
      } catch {
        name = "";
      }
      const result = await offerService.uploadEvidenceFile(
        req.auth.userId,
        req.validated.params.offerId,
        { bytes: req.body, mimeType: req.get("X-Evidence-Mime-Type"), name },
      );
      res.status(201).json({ success: true, data: result });
    },

    async evidenceFile(req, res) {
      const file = await offerService.evidenceFile(
        req.auth.userId,
        req.validated.params.offerId,
        req.validated.params.fileId,
        { ipAddress: req.ip },
      );
      res.set("Content-Type", file.mimeType);
      res.set(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      );
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.status(200).send(file.bytes);
    },
  });
}
