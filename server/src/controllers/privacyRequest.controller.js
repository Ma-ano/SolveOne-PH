export function createPrivacyRequestController(service) {
  return Object.freeze({
    async submit(req, res) {
      const result = await service.submit(req.auth.userId, req.validated.body, {
        ipAddress: req.ip,
      });
      res
        .status(result.duplicate ? 200 : 201)
        .json({ success: true, data: result });
    },
    async ownerList(req, res) {
      const result = await service.listOwner(
        req.auth.userId,
        req.validated.query,
      );
      res.set("Cache-Control", "private, no-store");
      res.status(200).json({ success: true, data: result });
    },
    async ownerDetail(req, res) {
      const result = await service.getOwner(
        req.auth.userId,
        req.validated.params.requestId,
      );
      res.set("Cache-Control", "private, no-store");
      res.status(200).json({ success: true, data: result });
    },
    async cancel(req, res) {
      const result = await service.cancel(
        req.auth.userId,
        req.validated.params.requestId,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async adminList(req, res) {
      const result = await service.listAdmin(req.auth, req.validated.query);
      res.set("Cache-Control", "private, no-store");
      res.status(200).json({ success: true, data: result });
    },
    async adminDetail(req, res) {
      const result = await service.getAdmin(
        req.auth,
        req.validated.params.requestId,
      );
      res.set("Cache-Control", "private, no-store");
      res.status(200).json({ success: true, data: result });
    },
    async claim(req, res) {
      const result = await service.claim(
        req.auth,
        req.validated.params.requestId,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async release(req, res) {
      const result = await service.release(
        req.auth,
        req.validated.params.requestId,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async resolve(req, res) {
      const result = await service.resolve(
        req.auth,
        req.validated.params.requestId,
        req.validated.body,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
  });
}
