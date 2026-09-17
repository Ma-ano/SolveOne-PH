import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createPrivacyRequestController } from "../src/controllers/privacyRequest.controller.js";
import { createPrivacyRequestRouters } from "../src/routes/privacyRequest.routes.js";
import { PrivacyRequestService } from "../src/services/privacyRequest.service.js";
import { AppError } from "../src/utils/AppError.js";
import { privacyRequestSchemas } from "../src/validators/privacyRequest.schemas.js";
import { createTestApp } from "./helpers/createTestApp.js";

const userId = "111111111111111111111111";
const adminId = "222222222222222222222222";
const requestId = "333333333333333333333333";
const now = new Date("2026-09-18T08:00:00.000Z");

function privacyRequest(overrides = {}) {
  return {
    _id: requestId,
    requesterId: userId,
    requestType: "access",
    details: "Please provide the personal data connected to my account.",
    status: "submitted",
    privacyPolicyVersion: "2026-09-18",
    assignedAdminId: null,
    claimedAt: null,
    resolutionSummary: null,
    resolvedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function harness() {
  const repository = {
    submit: vi.fn(async () => ({
      outcome: "created",
      request: privacyRequest(),
    })),
    listOwner: vi.fn(async () => ({
      items: [privacyRequest()],
      hasNextPage: false,
    })),
    findOwner: vi.fn(async ({ requestId: target }) =>
      target === requestId ? privacyRequest() : null,
    ),
    cancel: vi.fn(async () => ({
      outcome: "cancelled",
      request: privacyRequest({ status: "cancelled" }),
    })),
    listAdmin: vi.fn(async () => ({
      items: [
        privacyRequest({
          requesterId: {
            _id: userId,
            firstName: "Maria",
            lastName: "Santos",
            accountStatus: "active",
          },
        }),
      ],
      hasNextPage: false,
    })),
    findAdmin: vi.fn(async () =>
      privacyRequest({
        requesterId: {
          _id: userId,
          firstName: "Maria",
          lastName: "Santos",
          email: "maria@example.com",
          accountStatus: "active",
        },
      }),
    ),
    claim: vi.fn(async () => ({
      outcome: "claimed",
      request: privacyRequest({
        status: "in_review",
        assignedAdminId: adminId,
        claimedAt: now,
      }),
    })),
    release: vi.fn(async () => ({
      outcome: "released",
      request: privacyRequest(),
    })),
    resolve: vi.fn(async ({ outcome, resolutionSummary }) => ({
      outcome: "resolved",
      request: privacyRequest({
        status: outcome,
        resolutionSummary,
        resolvedAt: now,
      }),
    })),
  };
  const authService = {
    async authenticateAccessToken(token) {
      if (token === "user") return { userId, role: "user" };
      if (token === "admin") return { userId: adminId, role: "admin" };
      if (token === "moderator") return { userId: adminId, role: "moderator" };
      throw new AppError({
        statusCode: 401,
        code: "AUTH_REQUIRED",
        message: "Authentication is required",
      });
    },
  };
  const service = new PrivacyRequestService({
    repository,
    config: {
      privacyVersion: "2026-09-18",
      ipHashSecret: "test-ip-hash-secret-with-at-least-32-characters",
    },
    clock: () => now,
  });
  const routers = createPrivacyRequestRouters({
    controller: createPrivacyRequestController(service),
    schemas: privacyRequestSchemas,
    authService,
  });
  const app = createTestApp(
    {},
    {
      privacyRequestRouter: routers.ownerRouter,
      adminPrivacyRequestRouter: routers.adminRouter,
    },
  );
  return { app, repository };
}

describe("privacy-request API boundary", () => {
  it("requires authentication and strict acknowledged intake", async () => {
    const { app, repository } = harness();
    expect((await request(app).get("/api/v1/privacy-requests")).status).toBe(
      401,
    );
    const invalid = await request(app)
      .post("/api/v1/privacy-requests")
      .set("Authorization", "Bearer user")
      .send({
        requestType: "access",
        details: "Please provide the personal data connected to my account.",
        acknowledgement: false,
      });
    expect(invalid.status).toBe(422);
    expect(repository.submit).not.toHaveBeenCalled();
  });

  it("creates and lists only owner-safe case data", async () => {
    const { app, repository } = harness();
    const created = await request(app)
      .post("/api/v1/privacy-requests")
      .set("Authorization", "Bearer user")
      .send({
        requestType: "access",
        details: "Please provide the personal data connected to my account.",
        acknowledgement: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.request).not.toHaveProperty("assignedAdminId");
    expect(repository.submit).toHaveBeenCalledWith(
      expect.objectContaining({ requesterId: userId, requestType: "access" }),
    );

    const listed = await request(app)
      .get("/api/v1/privacy-requests")
      .set("Authorization", "Bearer user");
    expect(listed.status).toBe(200);
    expect(listed.headers["cache-control"]).toBe("private, no-store");
    expect(listed.body.data.items).toHaveLength(1);
  });

  it("conceals another owner's request and limits cancellation", async () => {
    const { app, repository } = harness();
    const missing = await request(app)
      .get("/api/v1/privacy-requests/444444444444444444444444")
      .set("Authorization", "Bearer user");
    expect(missing.status).toBe(404);

    repository.cancel.mockResolvedValueOnce({
      outcome: "unavailable",
      request: privacyRequest({ status: "in_review" }),
    });
    const cancelled = await request(app)
      .post(`/api/v1/privacy-requests/${requestId}/cancel`)
      .set("Authorization", "Bearer user");
    expect(cancelled.status).toBe(409);
  });

  it("reserves queue access and requester email for administrators", async () => {
    const { app } = harness();
    const denied = await request(app)
      .get("/api/v1/admin/privacy-requests")
      .set("Authorization", "Bearer moderator");
    expect(denied.status).toBe(403);

    const detail = await request(app)
      .get(`/api/v1/admin/privacy-requests/${requestId}`)
      .set("Authorization", "Bearer admin");
    expect(detail.status).toBe(200);
    expect(detail.headers["cache-control"]).toBe("private, no-store");
    expect(detail.body.data.request.requester.email).toBe("maria@example.com");
  });

  it("requires the completion checklist before an assigned admin resolves", async () => {
    const { app, repository } = harness();
    const invalid = await request(app)
      .post(`/api/v1/admin/privacy-requests/${requestId}/resolve`)
      .set("Authorization", "Bearer admin")
      .send({
        outcome: "completed",
        resolutionSummary: "The requested account data was provided securely.",
        identityVerified: true,
        scopeReviewed: true,
        retentionReviewed: false,
      });
    expect(invalid.status).toBe(422);
    expect(repository.resolve).not.toHaveBeenCalled();

    const resolved = await request(app)
      .post(`/api/v1/admin/privacy-requests/${requestId}/resolve`)
      .set("Authorization", "Bearer admin")
      .send({
        outcome: "completed",
        resolutionSummary: "The requested account data was provided securely.",
        identityVerified: true,
        scopeReviewed: true,
        retentionReviewed: true,
      });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.request.status).toBe("completed");
  });
});
