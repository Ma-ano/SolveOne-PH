import { describe, expect, it } from "vitest";
import request from "supertest";

import { startServer } from "../src/server.js";

describe("server lifecycle", () => {
  it("starts on an ephemeral test port and stops cleanly", async () => {
    const runtime = await startServer({
      source: {
        NODE_ENV: "test",
        PORT: "0",
        LOG_LEVEL: "fatal",
        FRONTEND_URL: "http://localhost:8081",
      },
    });

    try {
      expect(runtime.httpServer.listening).toBe(true);

      const response = await request(runtime.httpServer).get("/health");
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ status: "ok" });

      const readiness = await request(runtime.httpServer).get("/health/ready");
      expect(readiness.status).toBe(200);
      expect(readiness.body).toEqual({ status: "ready" });
    } finally {
      await runtime.stop();
    }

    expect(runtime.httpServer.listening).toBe(false);
  });
});
