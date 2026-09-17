import { describe, expect, it } from "vitest";
import request from "supertest";

import { createTestApp } from "./helpers/createTestApp.js";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const app = createTestApp();
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("reports dependency readiness without exposing dependency details", async () => {
    const ready = await request(
      createTestApp({}, { readinessCheck: () => true }),
    ).get("/health/ready");
    expect(ready.status).toBe(200);
    expect(ready.body).toEqual({ status: "ready" });
    expect(ready.headers["cache-control"]).toBe("no-store");

    const unavailable = await request(
      createTestApp({}, { readinessCheck: () => false }),
    ).get("/health/ready");
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toEqual({ status: "unavailable" });
    expect(unavailable.text).not.toContain("mongo");
  });
});
