import { Router } from "express";

export function createHealthRouter({ readinessCheck = () => true } = {}) {
  const router = Router();

  router.get("/", (req, res) => {
    res.set("Cache-Control", "no-store");
    res.status(200).json({ status: "ok" });
  });

  router.get("/ready", (req, res) => {
    const ready = readinessCheck();
    res.set("Cache-Control", "no-store");
    res.status(ready ? 200 : 503).json({
      status: ready ? "ready" : "unavailable",
    });
  });

  return router;
}
