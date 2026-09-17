import { describe, expect, it } from "vitest";
import request from "supertest";

import { createTestApp } from "./helpers/createTestApp.js";

describe("HTTP application foundation", () => {
  it("adds a request ID and removes the Express signature", async () => {
    const response = await request(createTestApp()).get("/health");

    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });

  it("preserves a safe caller-supplied request ID", async () => {
    const response = await request(createTestApp())
      .get("/health")
      .set("X-Request-Id", "mobile-request-123");

    expect(response.headers["x-request-id"]).toBe("mobile-request-123");
  });

  it("returns the standard error envelope for unknown routes", async () => {
    const response = await request(createTestApp()).get("/missing");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: "ROUTE_NOT_FOUND",
        message: "Route not found",
      },
    });
  });

  it("allows configured web origins with credentials", async () => {
    const response = await request(createTestApp())
      .get("/health")
      .set("Origin", "http://localhost:8081");

    expect(response.status).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:8081",
    );
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("denies unconfigured web origins", async () => {
    const response = await request(createTestApp())
      .get("/health")
      .set("Origin", "https://attacker.example");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CORS_ORIGIN_DENIED");
  });

  it("rejects malformed JSON with a safe error", async () => {
    const response = await request(createTestApp())
      .post("/missing")
      .set("Content-Type", "application/json")
      .send('{"broken":');

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: "INVALID_JSON",
      message: "Request body contains invalid JSON",
    });
  });

  it("enforces the configured request-size limit", async () => {
    const response = await request(createTestApp({ jsonBodyLimit: "10b" }))
      .post("/missing")
      .send({ value: "more than ten bytes" });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns a standard response after the baseline rate limit is exceeded", async () => {
    const app = createTestApp({ rateLimitMax: 1 });

    await request(app).get("/missing");
    const response = await request(app).get("/missing");

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("RATE_LIMITED");
  });
});
