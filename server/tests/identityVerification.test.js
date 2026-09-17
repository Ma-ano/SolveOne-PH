import { EventEmitter } from "node:events";

import { describe, expect, it, vi } from "vitest";

import { VerificationRecord } from "../src/models/VerificationRecord.js";
import { VerificationUpload } from "../src/models/VerificationUpload.js";
import { Notification } from "../src/models/Notification.js";
import { createVerificationIndexes } from "../src/jobs/createVerificationIndexes.js";
import { VerificationService } from "../src/services/verification.service.js";
import {
  serializeOwnVerification,
  serializeReviewVerification,
} from "../src/serializers/verification.serializer.js";
import {
  MAX_IDENTITY_FILE_BYTES,
  validateIdentityImage,
} from "../src/utils/identityFiles.js";
import {
  buildClamdRequest,
  IdentityScanner,
  parseClamdResult,
} from "../src/utils/identityScanner.js";
import { parseEnvironment } from "../src/config/env.js";

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
const png = Buffer.concat([
  Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"),
  Buffer.alloc(12),
  Buffer.from("49454e4400000000", "hex"),
]);

function harness(enabled = true) {
  const repository = {
    findEligibleOwner: vi.fn(async () => ({ _id: ownerId })),
    findPendingOwner: vi.fn(async () => null),
    findLatestOwner: vi.fn(async () => null),
    upload: vi.fn(async () => ({
      id: uploadId,
      mimeType: "image/jpeg",
      size: jpeg.length,
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
        documents: [{ uploadId, mimeType: "image/jpeg", size: jpeg.length }],
        submittedAt: now,
        claimBy: reviewerId,
        claimExpiresAt: new Date(now.getTime() + 10000),
      },
    })),
    readDocument: vi.fn(async () => ({ bytes: jpeg, mimeType: "image/jpeg" })),
    decide: vi.fn(async () => ({
      outcome: "decided",
      record: { _id: recordId, status: "approved", reviewedAt: now },
      notification: { recipientId: ownerId, _id: uploadId },
    })),
  };
  const scanner = { scan: vi.fn(async () => true) };
  const publisher = { publishNotification: vi.fn() };
  const config = {
    identityProcessingEnabled: enabled,
    identityPrivacyNoticeVersion: "identity-v1",
    identityPrivacyNoticeUrl: "https://example.test/privacy/identity",
    ipHashSecret: "test-secret",
  };
  return {
    repository,
    scanner,
    publisher,
    service: new VerificationService({
      repository,
      scanner,
      config,
      publisher,
      clock: () => now,
    }),
  };
}

describe("identity verification file and malware gate", () => {
  it("accepts only bounded JPEG/PNG bytes matching the declared type", () => {
    expect(validateIdentityImage(jpeg, "image/jpeg")).toEqual({
      mimeType: "image/jpeg",
      size: jpeg.length,
    });
    expect(validateIdentityImage(png, "image/png").mimeType).toBe("image/png");
    for (const [bytes, type] of [
      [{}, "image/jpeg"],
      [jpeg, "image/png"],
      [png, "application/pdf"],
      [Buffer.alloc(MAX_IDENTITY_FILE_BYTES + 1), "image/jpeg"],
      [Buffer.from("ffd8ff", "hex"), "image/jpeg"],
    ]) {
      expect(() => validateIdentityImage(bytes, type)).toThrow();
    }
  });

  it("uses clamd INSTREAM framing and accepts only an explicit clean response", () => {
    const request = buildClamdRequest(jpeg);
    expect(request.subarray(0, 10).toString("ascii")).toBe("zINSTREAM\0");
    expect(request.readUInt32BE(10)).toBe(jpeg.length);
    expect(request.subarray(14, 14 + jpeg.length)).toEqual(jpeg);
    expect(request.readUInt32BE(request.length - 4)).toBe(0);
    expect(parseClamdResult("stream: OK")).toBe(true);
    expect(() => parseClamdResult("stream: Malware FOUND")).toThrowError(
      expect.objectContaining({ code: "IDENTITY_DOCUMENT_UNSAFE" }),
    );
    for (const response of ["stream: ERROR", "OK", "stream: OK trailing", ""]) {
      expect(() => parseClamdResult(response)).toThrowError(
        expect.objectContaining({ code: "IDENTITY_SCANNER_UNAVAILABLE" }),
      );
    }
  });

  it("fails closed when the local scanner cannot connect or returns no clean answer", async () => {
    const disabled = new IdentityScanner();
    await expect(disabled.scan(jpeg)).rejects.toMatchObject({
      code: "IDENTITY_SCANNER_UNAVAILABLE",
    });
    const throwing = new IdentityScanner({ identityScannerPort: 3310 }, () => {
      throw new Error("connection failed");
    });
    await expect(throwing.scan(jpeg)).rejects.toMatchObject({
      code: "IDENTITY_SCANNER_UNAVAILABLE",
    });
    const socket = new EventEmitter();
    socket.setTimeout = vi.fn();
    socket.write = vi.fn();
    socket.destroy = vi.fn();
    const scanner = new IdentityScanner(
      { identityScannerPort: 3310 },
      () => socket,
    );
    const pending = scanner.scan(jpeg);
    socket.emit("connect");
    expect(socket.write).toHaveBeenCalledWith(buildClamdRequest(jpeg));
    socket.emit("data", Buffer.from("stream: ERROR\0"));
    await expect(pending).rejects.toMatchObject({
      code: "IDENTITY_SCANNER_UNAVAILABLE",
    });
  });
});

describe("identity verification access and privacy", () => {
  it("requires current notice acknowledgement and screening before storing bytes", async () => {
    const { service, repository, scanner } = harness();
    await expect(
      service.upload(ownerId, {
        bytes: jpeg,
        mimeType: "image/jpeg",
        acknowledged: false,
        privacyNoticeVersion: "identity-v1",
      }),
    ).rejects.toMatchObject({ code: "IDENTITY_NOTICE_REQUIRED" });
    await expect(
      service.upload(ownerId, {
        bytes: jpeg,
        mimeType: "image/jpeg",
        acknowledged: true,
        privacyNoticeVersion: "old",
      }),
    ).rejects.toMatchObject({ code: "IDENTITY_NOTICE_REQUIRED" });
    expect(scanner.scan).not.toHaveBeenCalled();
    expect(repository.upload).not.toHaveBeenCalled();
    await service.upload(ownerId, {
      bytes: jpeg,
      mimeType: "image/jpeg",
      acknowledged: true,
      privacyNoticeVersion: "identity-v1",
    });
    expect(scanner.scan).toHaveBeenCalledOnce();
    expect(scanner.scan.mock.invocationCallOrder[0]).toBeLessThan(
      repository.upload.mock.invocationCallOrder[0],
    );
  });

  it("keeps collection disabled by default while allowing status reads", async () => {
    const { service, repository } = harness(false);
    expect((await service.requirements(ownerId)).enabled).toBe(false);
    await expect(service.upload(ownerId, {})).rejects.toMatchObject({
      code: "IDENTITY_VERIFICATION_UNAVAILABLE",
    });
    await expect(
      service.submit(ownerId, { uploadIds: [uploadId] }),
    ).rejects.toMatchObject({ code: "IDENTITY_VERIFICATION_UNAVAILABLE" });
    expect(repository.upload).not.toHaveBeenCalled();
  });

  it("requires reviewer role for the queue, claim, document access, and decision", async () => {
    const { service, repository } = harness();
    const member = { userId: ownerId, role: "user" };
    await expect(
      service.listQueue(member, { limit: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(service.claim(member, recordId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      service.document(member, recordId, uploadId),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      service.decide(member, recordId, "approve", null),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.readDocument).not.toHaveBeenCalled();
    expect(repository.decide).not.toHaveBeenCalled();
  });

  it("returns only allowlisted owner/reviewer DTO fields, never keys or hashes", () => {
    const record = {
      _id: recordId,
      status: "pending",
      type: "identity",
      activeKey: "secret",
      privacyNoticeVersion: "secret",
      userId: {
        _id: ownerId,
        firstName: "Ada",
        lastName: "Luna",
        email: "secret@example.test",
      },
      documents: [
        {
          uploadId,
          mimeType: "image/jpeg",
          size: jpeg.length,
          key: "identity/private",
        },
      ],
      claimBy: reviewerId,
      claimExpiresAt: new Date(now.getTime() + 10000),
      submittedAt: now,
    };
    const own = serializeOwnVerification(record);
    const review = serializeReviewVerification(record, reviewerId, now);
    expect(own).not.toHaveProperty("documents");
    expect(own).not.toHaveProperty("activeKey");
    expect(review.documents[0]).toEqual({
      id: uploadId,
      mimeType: "image/jpeg",
      size: jpeg.length,
    });
    expect(review.owner).toEqual({ id: ownerId, displayName: "Ada Luna" });
    expect(JSON.stringify([own, review])).not.toMatch(
      /secret|private|example\.test/,
    );
  });

  it("publishes only a decision hint after a successful review", async () => {
    const { service, publisher } = harness();
    const actor = { userId: reviewerId, role: "moderator" };
    const result = await service.decide(actor, recordId, "approve", null, {
      ipAddress: "127.0.0.1",
    });
    expect(result.verification).toEqual({
      id: recordId,
      status: "approved",
      reviewedAt: now.toISOString(),
    });
    expect(publisher.publishNotification).toHaveBeenCalledWith({
      recipientId: ownerId,
      notificationId: uploadId,
    });
  });

  it("cannot mark a case reviewed when its images were not opened", async () => {
    const { service, repository, publisher } = harness();
    repository.decide.mockResolvedValue({ outcome: "documents_unreviewed" });
    await expect(
      service.decide(
        { userId: reviewerId, role: "moderator" },
        recordId,
        "approve",
        null,
        { ipAddress: "127.0.0.1" },
      ),
    ).rejects.toMatchObject({
      code: "VERIFICATION_DOCUMENTS_UNREVIEWED",
      statusCode: 409,
    });
    expect(publisher.publishNotification).not.toHaveBeenCalled();
  });
});

describe("identity model and environment guardrails", () => {
  it("defines a unique pending-record index and hides storage secrets by default", () => {
    const activeIndex = VerificationRecord.schema
      .indexes()
      .find(
        ([, options]) => options.name === "verification_active_user_unique",
      );
    expect(activeIndex[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { activeKey: { $type: "string" } },
    });
    expect(VerificationUpload.schema.path("key").options.select).toBe(false);
    expect(VerificationUpload.schema.path("sha256").options.select).toBe(false);
    expect(
      VerificationRecord.schema.path("privacyNoticeVersion").options.select,
    ).toBe(false);
  });

  it("registers identity decisions as notification kinds, not request moderation actions", () => {
    expect(Notification.schema.path("kind").enumValues).toContain(
      "identity_approved",
    );
    expect(Notification.schema.path("kind").enumValues).toContain(
      "identity_rejected",
    );
    expect(Notification.schema.path("resourceType").enumValues).toContain(
      "verification",
    );
  });

  it("refuses collection without configured notice, scanner, and storage", () => {
    const source = { NODE_ENV: "test", IDENTITY_PROCESSING_ENABLED: "true" };
    expect(() => parseEnvironment(source)).toThrowError(
      expect.objectContaining({
        issues: expect.arrayContaining([
          expect.objectContaining({ field: "IDENTITY_PRIVACY_NOTICE_VERSION" }),
          expect.objectContaining({ field: "IDENTITY_SCANNER_SOCKET" }),
          expect.objectContaining({ field: "STORAGE_BUCKET" }),
        ]),
      }),
    );
    const disabled = parseEnvironment({ NODE_ENV: "test" });
    expect(disabled.identityProcessingEnabled).toBe(false);
  });

  it("provides a create-only operator index entry point", async () => {
    const recordModel = { createIndexes: vi.fn(async () => []) };
    const uploadModel = { createIndexes: vi.fn(async () => []) };
    await createVerificationIndexes(recordModel, uploadModel);
    expect(recordModel.createIndexes).toHaveBeenCalledOnce();
    expect(uploadModel.createIndexes).toHaveBeenCalledOnce();
  });
});
