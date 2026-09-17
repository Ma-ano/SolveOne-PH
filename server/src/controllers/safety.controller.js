export function createSafetyController(service) {
  return Object.freeze({
    async reportUser(req, res) {
      const result = await service.reportUser(
        req.auth.userId,
        req.validated.params.userId,
        req.validated.body,
      );
      res
        .status(result.duplicate ? 200 : 201)
        .json({ success: true, data: result });
    },
    async reportRequest(req, res) {
      const result = await service.reportRequest(
        req.auth.userId,
        req.validated.params.requestId,
        req.validated.body,
      );
      res
        .status(result.duplicate ? 200 : 201)
        .json({ success: true, data: result });
    },
    async reportGiveaway(req, res) {
      const result = await service.reportGiveaway(
        req.auth.userId,
        req.validated.params.itemId,
        req.validated.body,
      );
      res
        .status(result.duplicate ? 200 : 201)
        .json({ success: true, data: result });
    },
    async reportMission(req, res) {
      const result = await service.reportMission(
        req.auth.userId,
        req.validated.params.missionId,
        req.validated.body,
      );
      res
        .status(result.duplicate ? 200 : 201)
        .json({ success: true, data: result });
    },
    async blockUser(req, res) {
      const result = await service.blockUser(
        req.auth.userId,
        req.validated.params.userId,
        { ipAddress: req.ip },
      );
      res
        .status(result.duplicate ? 200 : 201)
        .json({ success: true, data: result });
    },
    async unblockUser(req, res) {
      const result = await service.unblockUser(
        req.auth.userId,
        req.validated.params.userId,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async listBlocks(req, res) {
      const result = await service.listBlocks(
        req.auth.userId,
        req.validated.query,
      );
      res.status(200).json({ success: true, data: result });
    },
    async queue(req, res) {
      const result = await service.listReports(req.auth, req.validated.query);
      res.status(200).json({ success: true, data: result });
    },
    async claim(req, res) {
      const result = await service.claimReport(
        req.auth,
        req.validated.params.reportId,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async detail(req, res) {
      const result = await service.reportDetail(
        req.auth,
        req.validated.params.reportId,
        { ipAddress: req.ip },
      );
      res.set("Cache-Control", "private, no-store");
      res.status(200).json({ success: true, data: result });
    },
    async resolve(req, res) {
      const result = await service.resolveReport(
        req.auth,
        req.validated.params.reportId,
        req.validated.body,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async suspend(req, res) {
      const result = await service.suspendUser(
        req.auth,
        req.validated.params.userId,
        req.validated.body.reason,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async reinstate(req, res) {
      const result = await service.reinstateUser(
        req.auth,
        req.validated.params.userId,
        req.validated.body.reason,
        { ipAddress: req.ip },
      );
      res.status(200).json({ success: true, data: result });
    },
    async audit(req, res) {
      const result = await service.listAuditLogs(req.auth, req.validated.query);
      res.set("Cache-Control", "private, no-store");
      res.status(200).json({ success: true, data: result });
    },
  });
}
