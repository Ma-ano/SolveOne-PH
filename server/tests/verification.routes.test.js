import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createVerificationController } from "../src/controllers/verification.controller.js";
import { createVerificationRouters } from "../src/routes/verification.routes.js";
import { VerificationService } from "../src/services/verification.service.js";
import { AppError } from "../src/utils/AppError.js";
import { verificationSchemas } from "../src/validators/verification.schemas.js";
import { createTestApp } from "./helpers/createTestApp.js";

const ownerId = "111111111111111111111111";
const reviewerId = "222222222222222222222222";
const recordId = "333333333333333333333333";
const uploadId = "444444444444444444444444";
const now = new Date("2026-09-16T12:00:00Z");
const jpeg = Buffer.concat([
  Buffer.from("ffd8ff", "hex"),
  Buffer.alloc(20),
  Buffer.from("ffd9", "hex"),
]);

function harness() {
  const repository = {
    findEligibleOwner: vi.fn(async () => ({ _id: ownerId })),
    findPendingOwner: vi.fn(async () => null),
    findLatestOwner: vi.fn(async () => null),
    upload: vi.fn(async () => ({
      id: uploadId,
      size: jpeg.length,
      mimeType: "image/jpeg",
    })),
    submit: vi.fn(async () => ({
      outcome: "submitted",
      record: {
        _id: recordId,
        type: "identity",
        status: "pending",
        documents: [{ uploadId }],
        submittedAt: now,
      },
    })),
    listQueue: vi.fn(async () => ({ items: [], hasNextPage: false })),
    claim: vi.fn(async () => ({
      outcome: "claimed",
      record: {
        _id: recordId,
        status: "pending",
        userId: ownerId,
        documents: [],
        submittedAt: now,
        claimBy: reviewerId,
        claimExpiresAt: new Date(now.getTime() + 10000),
      },
    })),
    readDocument: vi.fn(async () => ({ bytes: jpeg, mimeType: "image/jpeg" })),
    decide: vi.fn(async () => ({
      outcome: "decided",
      record: { _id: recordId, status: "approved", reviewedAt: now },
    })),
  };
  const scanner = { scan: vi.fn(async () => true) };
  const service = new VerificationService({
    repository,
    scanner,
    config: {
      identityProcessingEnabled: true,
      identityPrivacyNoticeVersion: "identity-v1",
      identityPrivacyNoticeUrl: "https://example.test/privacy/identity",
      ipHashSecret: "test-secret",
    },
    clock: () => now,
  });
  const authService = {
    async authenticateAccessToken(token) {
      if (token === "owner") return { userId: ownerId, role: "user" };
      if (token === "moderator")
        return { userId: reviewerId, role: "moderator" };
      throw new AppError({
        statusCode: 401,
        code: "AUTH_REQUIRED",
        message: "Authentication is required",
      });
    },
  };
  const routers = createVerificationRouters({
    controller: createVerificationController(service),
    schemas: verificationSchemas,
    authService,
  });
  const app = createTestApp(
    {},
    {
      verificationRouter: routers.ownerRouter,
      adminVerificationRouter: routers.adminRouter,
    },
  );
  return { app, repository, scanner };
}

describe("identity verification API boundary", () => {
  it("requires authentication and a reviewer role for private queue and images", async () => {
    const { app, repository } = harness();
    expect(
      (await request(app).get("/api/v1/verifications/identity/me")).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/v1/admin/verifications/identity")
          .set("Authorization", "Bearer owner")
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .get(
            `/api/v1/admin/verifications/identity/${recordId}/documents/${uploadId}`,
          )
          .set("Authorization", "Bearer owner")
      ).status,
    ).toBe(403);
    expect(repository.readDocument).not.toHaveBeenCalled();
  });

  it("refuses ID bytes without the exact current notice acknowledgement", async () => {
    const { app, repository, scanner } = harness();
    const url = "/api/v1/verifications/identity/uploads";
    const missing = await request(app)
      .post(url)
      .set("Authorization", "Bearer owner")
      .set("Content-Type", "application/octet-stream")
      .set("X-Identity-Mime-Type", "image/jpeg")
      .send(jpeg);
    expect(missing.status).toBe(422);
    const stale = await request(app)
      .post(url)
      .set("Authorization", "Bearer owner")
      .set("Content-Type", "application/octet-stream")
      .set("X-Identity-Mime-Type", "image/jpeg")
      .set("X-Identity-Acknowledged", "true")
      .set("X-Identity-Notice-Version", "old")
      .send(jpeg);
    expect(stale.status).toBe(422);
    expect(repository.upload).not.toHaveBeenCalled();
    expect(scanner.scan).not.toHaveBeenCalled();
    const accepted = await request(app)
      .post(url)
      .set("Authorization", "Bearer owner")
      .set("Content-Type", "application/octet-stream")
      .set("X-Identity-Mime-Type", "image/jpeg")
      .set("X-Identity-Acknowledged", "true")
      .set("X-Identity-Notice-Version", "identity-v1")
      .send(jpeg);
    expect(accepted.status).toBe(201);
    expect(accepted.body.data.upload).toEqual({
      id: uploadId,
      size: jpeg.length,
      mimeType: "image/jpeg",
    });
  });

  it("validates distinct owner-upload IDs and rejects review-state mass assignment", async () => {
    const { app, repository } = harness();
    const url = "/api/v1/verifications/identity/submit";
    const invalid = await request(app)
      .post(url)
      .set("Authorization", "Bearer owner")
      .send({ uploadIds: [uploadId, uploadId], acknowledged: true });
    expect(invalid.status).toBe(422);
    const assignment = await request(app)
      .post(url)
      .set("Authorization", "Bearer owner")
      .send({ uploadIds: [uploadId], acknowledged: true, status: "approved" });
    expect(assignment.status).toBe(422);
    expect(repository.submit).not.toHaveBeenCalled();
    const accepted = await request(app)
      .post(url)
      .set("Authorization", "Bearer owner")
      .send({ uploadIds: [uploadId], acknowledged: true });
    expect(accepted.status).toBe(201);
  });

  it("allows assigned moderator downloads only through the protected route with no-store headers", async () => {
    const { app, repository } = harness();
    const url = `/api/v1/admin/verifications/identity/${recordId}/documents/${uploadId}`;
    const invalid = await request(app)
      .get(
        `/api/v1/admin/verifications/identity/${recordId}/documents/not-an-id`,
      )
      .set("Authorization", "Bearer moderator");
    expect(invalid.status).toBe(422);
    const file = await request(app)
      .get(url)
      .set("Authorization", "Bearer moderator");
    expect(file.status).toBe(200);
    expect(file.headers["cache-control"]).toBe("private, no-store");
    expect(file.headers["x-content-type-options"]).toBe("nosniff");
    expect(file.headers["content-disposition"]).toContain(
      "identity-review.jpg",
    );
    expect(file.headers["content-disposition"]).not.toContain("owner");
    expect(repository.readDocument).toHaveBeenCalledWith(
      expect.objectContaining({ reviewerId, recordId, uploadId }),
    );
  });
});
