import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createDonationController } from "../src/controllers/donation.controller.js";
import { createDonationRouters } from "../src/routes/donation.routes.js";
import { donationSchemas } from "../src/validators/donation.schemas.js";
import { createTestApp } from "./helpers/createTestApp.js";

const userId = "111111111111111111111111";

function harness(overrides = {}, config = {}) {
  const service = {
    createCheckout: vi.fn().mockResolvedValue({
      donation: { id: "222222222222222222222222" },
      checkoutUrl: "https://checkout.paymongo.com/session",
      replayed: false,
    }),
    history: vi.fn().mockResolvedValue({
      items: [],
      pageInfo: { hasNextPage: false, nextCursor: null },
    }),
    dashboard: vi.fn().mockResolvedValue({ mode: "test", recent: [] }),
    webhook: vi.fn().mockResolvedValue({ outcome: "processed" }),
    ...overrides,
  };
  const authService = {
    async authenticateAccessToken(token) {
      if (token === "admin") return { userId, role: "admin" };
      if (token === "user") return { userId, role: "user" };
      throw Object.assign(new Error("Authentication is required"), {
        statusCode: 401,
        code: "AUTH_REQUIRED",
        isOperational: true,
      });
    },
  };
  const routers = createDonationRouters({
    controller: createDonationController(service),
    schemas: donationSchemas,
    authService,
  });
  const app = createTestApp(config, {
    donationRouter: routers.ownerRouter,
    adminDonationRouter: routers.adminRouter,
    donationWebhookRouter: routers.webhookRouter,
  });
  return { app, service };
}

describe("platform donation API", () => {
  it("requires authentication, a valid idempotency key, and a strict bounded amount", async () => {
    const { app, service } = harness();
    expect(
      (
        await request(app)
          .post("/api/v1/platform-donations/checkout")
          .send({ amountCentavos: 25000 })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post("/api/v1/platform-donations/checkout")
          .set("Authorization", "Bearer user")
          .send({ amountCentavos: 25000 })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/v1/platform-donations/checkout")
          .set("Authorization", "Bearer user")
          .set("Idempotency-Key", "operation-key-123456")
          .send({ amountCentavos: 25000, status: "paid" })
      ).status,
    ).toBe(422);
    const valid = await request(app)
      .post("/api/v1/platform-donations/checkout")
      .set("Authorization", "Bearer user")
      .set("Idempotency-Key", "operation-key-123456")
      .send({ amountCentavos: 25000 });
    expect(valid.status).toBe(201);
    expect(service.createCheckout).toHaveBeenCalledWith(
      userId,
      { amountCentavos: 25000 },
      "operation-key-123456",
    );
  });

  it("keeps dashboard access admin-only and passes request context for auditing", async () => {
    const { app, service } = harness();
    const denied = await request(app)
      .get("/api/v1/admin/platform-donations/dashboard")
      .set("Authorization", "Bearer user");
    expect(denied.status).toBe(403);
    const allowed = await request(app)
      .get("/api/v1/admin/platform-donations/dashboard")
      .set("Authorization", "Bearer admin");
    expect(allowed.status).toBe(200);
    expect(service.dashboard).toHaveBeenCalledWith(
      { userId, role: "admin" },
      expect.any(String),
    );
  });

  it("delivers exact raw webhook bytes and bypasses the general API limiter", async () => {
    const { app, service } = harness({}, { rateLimitMax: 1 });
    const raw = '{"not":"parsed here"}';
    const first = await request(app)
      .post("/api/v1/webhooks/paymongo")
      .set("Content-Type", "application/json")
      .send(raw);
    const second = await request(app)
      .post("/api/v1/webhooks/paymongo")
      .set("Content-Type", "application/json")
      .send(raw);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(Buffer.isBuffer(service.webhook.mock.calls[0][0])).toBe(true);
    expect(service.webhook.mock.calls[0][0].toString("utf8")).toBe(raw);
  });

  it("exposes no client route that can mark a donation paid", async () => {
    const { app, service } = harness();
    const response = await request(app)
      .post("/api/v1/platform-donations/222222222222222222222222/paid")
      .set("Authorization", "Bearer user")
      .send({ status: "paid" });
    expect(response.status).toBe(404);
    expect(service.createCheckout).not.toHaveBeenCalled();
  });
});
