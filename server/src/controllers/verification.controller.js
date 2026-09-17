export function createVerificationController(service) {
  return Object.freeze({
    async requirements(req, res) {
      const result = await service.requirements(req.auth.userId);
      res.status(200).json({ success: true, data: result });
    },
    async latestOwn(req, res) {
      const result = await service.latestOwn(req.auth.userId);
      res.status(200).json({ success: true, data: result });
    },
    async upload(req, res) {
      const result = await service.upload(req.auth.userId, {
        bytes: req.body,
        mimeType: req.get("X-Identity-Mime-Type"),
        acknowledged: req.get("X-Identity-Acknowledged") === "true",
        privacyNoticeVersion: req.get("X-Identity-Notice-Version"),
      });
      res.status(201).json({ success: true, data: result });
    },
    async submit(req, res) {
      const result = await service.submit(req.auth.userId, req.validated.body);
      res
        .status(result.replayed ? 200 : 201)
        .json({ success: true, data: result });
    },
    async queue(req, res) {
      const result = await service.listQueue(req.auth, req.validated.query);
      res.status(200).json({ success: true, data: result });
    },
    async claim(req, res) {
      const result = await service.claim(
        req.auth,
        req.validated.params.recordId,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async document(req, res) {
      const file = await service.document(
        req.auth,
        req.validated.params.recordId,
        req.validated.params.uploadId,
        { ipAddress: req.ip },
      );
      const extension = file.mimeType === "image/png" ? "png" : "jpg";
      res.set("Content-Type", "application/octet-stream");
      res.set(
        "Content-Disposition",
        `attachment; filename="identity-review.${extension}"`,
      );
      res.set("Cache-Control", "private, no-store");
      res.set("X-Content-Type-Options", "nosniff");
      res.status(200).send(file.bytes);
    },
    async approve(req, res) {
      const result = await service.decide(
        req.auth,
        req.validated.params.recordId,
        "approve",
        null,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async reject(req, res) {
      const result = await service.decide(
        req.auth,
        req.validated.params.recordId,
        "reject",
        req.validated.body.reason,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
  });
}
