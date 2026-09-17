import mongoose from "mongoose";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AuditLog } from "../src/models/AuditLog.js";
import { Notification } from "../src/models/Notification.js";
import { User } from "../src/models/User.js";
import { VerificationRecord } from "../src/models/VerificationRecord.js";
import { VerificationUpload } from "../src/models/VerificationUpload.js";
import { VerificationRepository } from "../src/repositories/verification.repository.js";

const ownerId = "111111111111111111111111";
const reviewerId = "222222222222222222222222";
const recordId = "333333333333333333333333";
const uploadId = "444444444444444444444444";
const now = new Date("2026-09-16T12:00:00Z");

function query(result) {
  return {
    session() {
      return this;
    },
    select() {
      return this;
    },
    lean() {
      return this;
    },
    async exec() {
      return result;
    },
  };
}

function pending() {
  return {
    _id: recordId,
    userId: ownerId,
    status: "pending",
    claimBy: reviewerId,
    claimExpiresAt: new Date(now.getTime() + 10000),
    documents: [{ uploadId }],
  };
}

afterEach(() => vi.restoreAllMocks());

describe("identity review transaction contract", () => {
  it("does not disguise an unrelated unique-index failure as a pending replay", async () => {
    const duplicate = Object.assign(new Error("unexpected duplicate"), {
      code: 11000,
    });
    vi.spyOn(mongoose.connection, "transaction").mockRejectedValue(duplicate);
    vi.spyOn(VerificationRecord, "findOne").mockReturnValue(query(null));
    const repository = new VerificationRepository({ storage: {} });
    await expect(
      repository.submit({
        ownerId,
        ids: [uploadId],
        privacyNoticeVersion: "identity-v1",
        now,
      }),
    ).rejects.toBe(duplicate);
  });

  it("cannot decide until the assigned reviewer has opened every attached image", async () => {
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(
      async (fn) => fn({}),
    );
    vi.spyOn(VerificationRecord, "findOne").mockReturnValue(query(pending()));
    vi.spyOn(AuditLog, "find").mockReturnValue(query([]));
    const advance = vi.spyOn(User, "findOneAndUpdate");
    const repository = new VerificationRepository({ storage: {} });
    const result = await repository.decide({
      reviewerId,
      recordId,
      decision: "approve",
      reason: null,
      ipHash: "hash",
      now,
    });
    expect(result.outcome).toBe("documents_unreviewed");
    expect(advance).not.toHaveBeenCalled();
    expect(AuditLog.find).toHaveBeenCalledWith({
      actorId: reviewerId,
      action: "identity_document_accessed",
      targetType: "verification_record",
      targetId: recordId,
    });
  });

  it("conditionally advances the factual badge and writes audit, purge, notification in one transaction", async () => {
    const session = { marker: "transaction-session" };
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(
      async (fn) => fn(session),
    );
    vi.spyOn(VerificationRecord, "findOne").mockReturnValue(query(pending()));
    vi.spyOn(AuditLog, "find").mockReturnValue(
      query([{ metadata: { uploadId } }]),
    );
    vi.spyOn(User, "findOne").mockReturnValue(
      query({ _id: ownerId, verification: { level: "EMAIL_VERIFIED" } }),
    );
    const advance = vi
      .spyOn(User, "findOneAndUpdate")
      .mockReturnValue(query({ _id: ownerId }));
    const update = vi
      .spyOn(VerificationRecord, "findOneAndUpdate")
      .mockReturnValue(
        query({ _id: recordId, status: "approved", reviewedAt: now }),
      );
    const purge = vi
      .spyOn(VerificationUpload, "updateMany")
      .mockResolvedValue({ modifiedCount: 1 });
    const audit = vi.spyOn(AuditLog, "create").mockResolvedValue([]);
    const notification = vi.spyOn(Notification, "create").mockResolvedValue([
      {
        toObject: () => ({
          _id: "555555555555555555555555",
          recipientId: ownerId,
        }),
      },
    ]);
    const repository = new VerificationRepository({ storage: {} });
    const result = await repository.decide({
      reviewerId,
      recordId,
      decision: "approve",
      reason: null,
      ipHash: "hash",
      now,
    });
    expect(result.outcome).toBe("decided");
    expect(advance.mock.calls[0][0]).toMatchObject({
      _id: ownerId,
      "verification.level": { $in: ["UNVERIFIED", "EMAIL_VERIFIED"] },
    });
    expect(advance.mock.calls[0][1]).toMatchObject({
      $set: { "verification.level": "IDENTITY_VERIFIED" },
    });
    expect(update.mock.calls[0][0]).toMatchObject({
      _id: recordId,
      status: "pending",
      claimBy: reviewerId,
      claimExpiresAt: { $gt: now },
    });
    expect(update.mock.calls[0][1]).toMatchObject({
      $set: { status: "approved", reviewedBy: reviewerId },
      $unset: { activeKey: 1 },
    });
    expect(purge).toHaveBeenCalledWith(
      { attachedRecordId: recordId, ownerId },
      { $set: { purgeAt: now, updatedAt: now } },
      { session, runValidators: true },
    );
    expect(audit.mock.calls[0][0][0]).toMatchObject({
      action: "identity_verification_approved",
      actorId: reviewerId,
      targetId: recordId,
      ipHash: "hash",
    });
    expect(audit.mock.calls[0][1]).toEqual({ session });
    expect(notification.mock.calls[0][0][0]).toMatchObject({
      recipientId: ownerId,
      kind: "identity_approved",
      resourceType: "verification",
      resourceId: recordId,
    });
    expect(notification.mock.calls[0][1]).toEqual({ session });
  });

  it("does not silently regress an already advanced badge", async () => {
    vi.spyOn(mongoose.connection, "transaction").mockImplementation(
      async (fn) => fn({}),
    );
    vi.spyOn(VerificationRecord, "findOne").mockReturnValue(query(pending()));
    vi.spyOn(AuditLog, "find").mockReturnValue(
      query([{ metadata: { uploadId } }]),
    );
    vi.spyOn(User, "findOne").mockReturnValue(
      query({ _id: ownerId, verification: { level: "PARTNER_VERIFIED" } }),
    );
    vi.spyOn(User, "findOneAndUpdate").mockReturnValue(query(null));
    const update = vi.spyOn(VerificationRecord, "findOneAndUpdate");
    const repository = new VerificationRepository({ storage: {} });
    const result = await repository.decide({
      reviewerId,
      recordId,
      decision: "approve",
      reason: null,
      ipHash: "hash",
      now,
    });
    expect(result.outcome).toBe("state_changed");
    expect(update).not.toHaveBeenCalled();
  });
});
