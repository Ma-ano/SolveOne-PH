import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createSafetyController } from "../src/controllers/safety.controller.js";
import { createSafetyRouters } from "../src/routes/safety.routes.js";
import { SafetyService } from "../src/services/safety.service.js";
import { AppError } from "../src/utils/AppError.js";
import { safetySchemas } from "../src/validators/safety.schemas.js";
import { createTestApp } from "./helpers/createTestApp.js";

const userId = "111111111111111111111111";
const targetId = "222222222222222222222222";
const moderatorId = "333333333333333333333333";
const adminId = "444444444444444444444444";
const reportId = "555555555555555555555555";
const requestId = "666666666666666666666666";
const giveawayItemId = "888888888888888888888888";
const missionId = "999999999999999999999999";
const now = new Date("2026-09-17T12:00:00Z");

function report(overrides = {}) {
  return {
    _id: reportId,
    reporterId: {
      _id: userId,
      firstName: "Maria",
      lastName: "Santos",
      role: "user",
      accountStatus: "active",
      verification: { level: "EMAIL_VERIFIED" },
    },
    reportedUserId: {
      _id: targetId,
      firstName: "Juan",
      lastName: "Dela Cruz",
      role: "user",
      accountStatus: "active",
      verification: { level: "UNVERIFIED" },
    },
    targetType: "user",
    targetId,
    reason: "scam",
    description: "Asked for payment outside the platform.",
    status: "open",
    createdAt: now,
    ...overrides,
  };
}

function harness() {
  const repository = {
    reportUser: vi.fn(async () => ({ outcome: "created", report: report() })),
    reportRequest: vi.fn(async () => ({
      outcome: "created",
      report: report({ targetType: "request", targetId: requestId }),
    })),
    reportGiveaway: vi.fn(async () => ({
      outcome: "created",
      report: report({
        targetType: "giveaway_item",
        targetId: giveawayItemId,
      }),
    })),
    reportMission: vi.fn(async () => ({
      outcome: "created",
      report: report({
        targetType: "community_mission",
        targetId: missionId,
      }),
    })),
    blockUser: vi.fn(async () => ({ outcome: "created", block: {} })),
    unblockUser: vi.fn(async () => ({ outcome: "removed" })),
    listBlocks: vi.fn(async () => ({ items: [], hasNextPage: false })),
    listReports: vi.fn(async () => ({ items: [report()], hasNextPage: false })),
    claimReport: vi.fn(async () => ({
      outcome: "claimed",
      report: report({
        status: "reviewing",
        assignedModerator: moderatorId,
        claimExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      }),
    })),
    readReportEvidence: vi.fn(async () => ({
      report: report({
        status: "reviewing",
        assignedModerator: moderatorId,
        claimExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
      }),
      evidence: { type: "user", id: targetId, displayName: "Juan D." },
    })),
    resolveReport: vi.fn(async ({ outcome, resolution }) =>
      report({ status: outcome, resolution }),
    ),
    suspendUser: vi.fn(async () => ({
      _id: targetId,
      accountStatus: "suspended",
      suspendedAt: now,
    })),
    reinstateUser: vi.fn(async () => ({
      _id: targetId,
      accountStatus: "active",
      reinstatedAt: now,
    })),
    listAuditLogs: vi.fn(async () => ({
      items: [
        {
          _id: "777777777777777777777777",
          actorId: {
            _id: adminId,
            firstName: "Ana",
            lastName: "Admin",
            role: "admin",
          },
          action: "user_suspended",
          targetType: "user",
          targetId,
          metadata: { secretContext: "must-not-leak" },
          ipHash: "must-not-leak",
          createdAt: now,
        },
      ],
      hasNextPage: false,
    })),
  };
  const authService = {
    async authenticateAccessToken(token) {
      if (token === "user") return { userId, role: "user" };
      if (token === "moderator")
        return { userId: moderatorId, role: "moderator" };
      if (token === "admin") return { userId: adminId, role: "admin" };
      throw new AppError({
        statusCode: 401,
        code: "AUTH_REQUIRED",
        message: "Authentication is required",
      });
    },
  };
  const service = new SafetyService({
    repository,
    config: { ipHashSecret: "test-ip-hash-secret-with-at-least-32-characters" },
    clock: () => now,
  });
  const routers = createSafetyRouters({
    controller: createSafetyController(service),
    schemas: safetySchemas,
    authService,
  });
  const app = createTestApp(
    {},
    {
      reportRouter: routers.reportRouter,
      blockRouter: routers.blockRouter,
      adminSafetyRouter: routers.adminRouter,
    },
  );
  return { app, repository };
}

describe("safety API boundary", () => {
  it("requires authentication and rejects report mass assignment", async () => {
    const { app, repository } = harness();
    expect(
      (await request(app).post(`/api/v1/reports/users/${targetId}`)).status,
    ).toBe(401);
    const response = await request(app)
      .post(`/api/v1/reports/users/${targetId}`)
      .set("Authorization", "Bearer user")
      .send({ reason: "scam", status: "resolved" });
    expect(response.status).toBe(422);
    expect(repository.reportUser).not.toHaveBeenCalled();
  });

  it("creates user and request reports with enumerated reasons", async () => {
    const { app, repository } = harness();
    const userReport = await request(app)
      .post(`/api/v1/reports/users/${targetId}`)
      .set("Authorization", "Bearer user")
      .send({
        reason: "impersonation",
        description: "This profile copies another local volunteer.",
      });
    expect(userReport.status).toBe(201);
    const requestReport = await request(app)
      .post(`/api/v1/reports/requests/${requestId}`)
      .set("Authorization", "Bearer user")
      .send({ reason: "privacy_exposure" });
    expect(requestReport.status).toBe(201);
    expect(repository.reportRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: requestId,
        reason: "privacy_exposure",
      }),
    );
    const giveawayReport = await request(app)
      .post(`/api/v1/reports/giveaway-items/${giveawayItemId}`)
      .set("Authorization", "Bearer user")
      .send({ reason: "prohibited_content" });
    expect(giveawayReport.status).toBe(201);
    expect(repository.reportGiveaway).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: giveawayItemId,
        reason: "prohibited_content",
      }),
    );
    const missionReport = await request(app)
      .post(`/api/v1/reports/community-missions/${missionId}`)
      .set("Authorization", "Bearer user")
      .send({ reason: "dangerous_activity" });
    expect(missionReport.status).toBe(201);
    expect(repository.reportMission).toHaveBeenCalledWith(
      expect.objectContaining({
        targetId: missionId,
        reason: "dangerous_activity",
      }),
    );
  });

  it("lets members manage only their own block list", async () => {
    const { app, repository } = harness();
    expect(
      (
        await request(app)
          .post(`/api/v1/blocks/${targetId}`)
          .set("Authorization", "Bearer user")
          .send({})
      ).status,
    ).toBe(201);
    expect(
      (
        await request(app)
          .delete(`/api/v1/blocks/${targetId}`)
          .set("Authorization", "Bearer user")
      ).status,
    ).toBe(200);
    expect(repository.blockUser).toHaveBeenCalledWith(
      expect.objectContaining({ blockerId: userId, blockedId: targetId }),
    );
  });

  it("requires a reviewer role and a claim before evidence access", async () => {
    const { app, repository } = harness();
    expect(
      (
        await request(app)
          .get("/api/v1/admin/safety/reports")
          .set("Authorization", "Bearer user")
      ).status,
    ).toBe(403);
    const claim = await request(app)
      .post(`/api/v1/admin/safety/reports/${reportId}/claim`)
      .set("Authorization", "Bearer moderator")
      .send({});
    expect(claim.status).toBe(200);
    const detail = await request(app)
      .get(`/api/v1/admin/safety/reports/${reportId}`)
      .set("Authorization", "Bearer moderator");
    expect(detail.status).toBe(200);
    expect(detail.headers["cache-control"]).toBe("private, no-store");
    expect(detail.body.data.evidence).toEqual({
      type: "user",
      id: targetId,
      displayName: "Juan D.",
    });
    expect(detail.body.data.report.reporter).toBeUndefined();
    expect(repository.readReportEvidence).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerId: moderatorId, reportId }),
    );
  });

  it("allows only admins to suspend accounts and read redacted audit logs", async () => {
    const { app, repository } = harness();
    const path = `/api/v1/admin/safety/users/${targetId}/suspend`;
    expect(
      (
        await request(app)
          .post(path)
          .set("Authorization", "Bearer moderator")
          .send({ reason: "Repeated credential theft attempts." })
      ).status,
    ).toBe(403);
    const suspended = await request(app)
      .post(path)
      .set("Authorization", "Bearer admin")
      .send({ reason: "Repeated credential theft attempts." });
    expect(suspended.status).toBe(200);
    expect(suspended.body.data.user).toMatchObject({
      id: targetId,
      accountStatus: "suspended",
    });
    const logs = await request(app)
      .get("/api/v1/admin/safety/audit-logs")
      .set("Authorization", "Bearer admin");
    expect(logs.status).toBe(200);
    expect(logs.headers["cache-control"]).toBe("private, no-store");
    expect(logs.body.data.items[0]).not.toHaveProperty("metadata");
    expect(logs.body.data.items[0]).not.toHaveProperty("ipHash");
    expect(repository.suspendUser).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: adminId, userId: targetId }),
    );
  });
});
