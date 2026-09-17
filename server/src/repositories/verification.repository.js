import mongoose from "mongoose";

import { AuditLog } from "../models/AuditLog.js";
import { User } from "../models/User.js";
import { VerificationRecord } from "../models/VerificationRecord.js";
import { VerificationUpload } from "../models/VerificationUpload.js";
import { VerificationStorageRepository } from "./verificationStorage.repository.js";
import { createNotification } from "./notificationWrites.js";

function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function sameUploads(record, ids) {
  return (
    record?.documents?.length === ids.length &&
    record.documents.every(
      (document, index) => idOf(document.uploadId) === String(ids[index]),
    )
  );
}

function withQueueCursor(cursor) {
  if (!cursor) return {};
  return {
    $or: [
      { submittedAt: { $gt: cursor.date } },
      { submittedAt: cursor.date, _id: { $gt: cursor.id } },
    ],
  };
}

class VerificationAbort extends Error {
  constructor(outcome) {
    super(outcome);
    this.outcome = outcome;
  }
}

export class VerificationRepository {
  constructor({ storage = new VerificationStorageRepository() } = {}) {
    this.storage = storage;
  }

  findEligibleOwner(userId) {
    return User.findOne({
      _id: userId,
      accountStatus: "active",
      emailVerified: true,
      "verification.level": { $in: ["UNVERIFIED", "EMAIL_VERIFIED"] },
    })
      .select("_id verification.level")
      .lean()
      .exec();
  }

  findPendingOwner(userId) {
    return VerificationRecord.findOne({
      userId,
      type: "identity",
      status: "pending",
    })
      .lean()
      .exec();
  }

  findLatestOwner(userId) {
    return VerificationRecord.findOne({ userId, type: "identity" })
      .sort({ createdAt: -1, _id: -1 })
      .lean()
      .exec();
  }

  async upload({ ownerId, bytes, mimeType, privacyNoticeVersion, now }) {
    return this.storage.upload({
      ownerId,
      bytes,
      mimeType,
      privacyNoticeVersion,
      now,
    });
  }

  async submit({ ownerId, ids, privacyNoticeVersion, now }) {
    let outcome = "unavailable";
    let recordId = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "unavailable";
        recordId = null;
        const pending = await VerificationRecord.findOne({
          userId: ownerId,
          type: "identity",
          status: "pending",
        })
          .session(session)
          .lean()
          .exec();
        if (pending) {
          outcome = sameUploads(pending, ids) ? "replayed" : "already_pending";
          recordId = pending._id;
          return;
        }
        const eligible = await User.findOne({
          _id: ownerId,
          accountStatus: "active",
          emailVerified: true,
          "verification.level": { $in: ["UNVERIFIED", "EMAIL_VERIFIED"] },
        })
          .session(session)
          .select("_id")
          .lean()
          .exec();
        if (!eligible) return;
        const documents = await this.storage.verifyForSubmission({
          ownerId,
          ids,
          privacyNoticeVersion,
          now,
          session,
        });
        if (!documents) {
          outcome = "invalid_upload";
          return;
        }
        const [created] = await VerificationRecord.create(
          [
            {
              userId: ownerId,
              type: "identity",
              status: "pending",
              activeKey: `identity:${ownerId}`,
              documents,
              privacyNoticeVersion,
              acknowledgedAt: now,
              submittedAt: now,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { session },
        );
        await this.storage.markAttached({
          ownerId,
          ids,
          recordId: created._id,
          now,
          session,
        });
        recordId = created._id;
        outcome = "submitted";
      });
    } catch (error) {
      if (error?.code !== 11000) throw error;
      const pending = await this.findPendingOwner(ownerId);
      if (!pending) throw error;
      outcome = sameUploads(pending, ids) ? "replayed" : "already_pending";
      recordId = pending._id;
    }
    return {
      outcome,
      record: recordId
        ? await VerificationRecord.findById(recordId).lean().exec()
        : null,
    };
  }

  async listQueue({ reviewerId, cursor, limit }) {
    const rows = await VerificationRecord.find({
      status: "pending",
      userId: { $ne: reviewerId },
      ...withQueueCursor(cursor),
    })
      .sort({ submittedAt: 1, _id: 1 })
      .populate({
        path: "userId",
        select: "firstName lastName accountStatus verification.level",
      })
      .limit(limit + 1)
      .lean()
      .exec();
    return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
  }

  async claim({ reviewerId, recordId, ipHash, now }) {
    let outcome = "not_found";
    let claimed = null;
    await mongoose.connection.transaction(async (session) => {
      outcome = "not_found";
      claimed = null;
      const record = await VerificationRecord.findOne({
        _id: recordId,
        status: "pending",
        userId: { $ne: reviewerId },
      })
        .session(session)
        .lean()
        .exec();
      if (!record) return;
      if (
        idOf(record.claimBy) === String(reviewerId) &&
        record.claimExpiresAt > now
      ) {
        outcome = "claimed";
        claimed = record;
        return;
      }
      const owner = await User.findOne({
        _id: record.userId,
        accountStatus: "active",
      })
        .session(session)
        .select("_id")
        .lean()
        .exec();
      if (!owner) {
        outcome = "unavailable";
        return;
      }
      claimed = await VerificationRecord.findOneAndUpdate(
        {
          _id: recordId,
          status: "pending",
          userId: { $ne: reviewerId },
          $or: [{ claimBy: null }, { claimExpiresAt: { $lte: now } }],
        },
        {
          $set: {
            claimBy: reviewerId,
            claimExpiresAt: new Date(now.getTime() + 30 * 60 * 1000),
            updatedAt: now,
          },
        },
        { new: true, session, runValidators: true },
      )
        .lean()
        .exec();
      if (!claimed) {
        outcome = "claimed_elsewhere";
        return;
      }
      await AuditLog.create(
        [
          {
            actorId: reviewerId,
            action: "identity_review_claimed",
            targetType: "verification_record",
            targetId: recordId,
            metadata: {},
            ipHash,
            createdAt: now,
          },
        ],
        { session },
      );
      outcome = "claimed";
    });
    return { outcome, record: claimed };
  }

  async readDocument({ reviewerId, recordId, uploadId, ipHash, now }) {
    const record = await VerificationRecord.findOne({
      _id: recordId,
      status: "pending",
      userId: { $ne: reviewerId },
      claimBy: reviewerId,
      claimExpiresAt: { $gt: now },
      "documents.uploadId": uploadId,
    })
      .select("userId documents")
      .lean()
      .exec();
    if (!record) return null;
    const file = await this.storage.read({
      recordId,
      uploadId,
      ownerId: record.userId,
    });
    if (!file) return null;
    await AuditLog.create({
      actorId: reviewerId,
      action: "identity_document_accessed",
      targetType: "verification_record",
      targetId: recordId,
      metadata: { uploadId: String(uploadId) },
      ipHash,
      createdAt: now,
    });
    return file;
  }

  async decide({ reviewerId, recordId, decision, reason, ipHash, now }) {
    let outcome = "not_found";
    let updated = null;
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "not_found";
        updated = null;
        notification = null;
        const record = await VerificationRecord.findOne({
          _id: recordId,
          status: "pending",
          userId: { $ne: reviewerId },
          claimBy: reviewerId,
          claimExpiresAt: { $gt: now },
        })
          .session(session)
          .lean()
          .exec();
        if (!record) return;
        const accesses = await AuditLog.find({
          actorId: reviewerId,
          action: "identity_document_accessed",
          targetType: "verification_record",
          targetId: recordId,
        })
          .session(session)
          .select("metadata.uploadId")
          .lean()
          .exec();
        const opened = new Set(
          accesses.map((entry) => entry.metadata?.uploadId),
        );
        if (
          record.documents.some(
            (document) => !opened.has(idOf(document.uploadId)),
          )
        ) {
          outcome = "documents_unreviewed";
          return;
        }
        const owner = await User.findOne({
          _id: record.userId,
          accountStatus: "active",
          emailVerified: true,
        })
          .session(session)
          .select("_id verification.level")
          .lean()
          .exec();
        if (!owner) {
          outcome = "unavailable";
          return;
        }
        if (decision === "approve") {
          const advanced = await User.findOneAndUpdate(
            {
              _id: record.userId,
              accountStatus: "active",
              emailVerified: true,
              "verification.level": {
                $in: ["UNVERIFIED", "EMAIL_VERIFIED"],
              },
            },
            {
              $set: {
                "verification.level": "IDENTITY_VERIFIED",
                updatedAt: now,
              },
            },
            { new: true, session, runValidators: true },
          )
            .select("_id")
            .lean()
            .exec();
          if (!advanced) throw new VerificationAbort("state_changed");
        }
        updated = await VerificationRecord.findOneAndUpdate(
          {
            _id: recordId,
            status: "pending",
            claimBy: reviewerId,
            claimExpiresAt: { $gt: now },
          },
          {
            $set: {
              status: decision === "approve" ? "approved" : "rejected",
              reviewedBy: reviewerId,
              reviewedAt: now,
              rejectionReason: decision === "reject" ? reason : null,
              claimBy: null,
              claimExpiresAt: null,
              updatedAt: now,
            },
            $unset: { activeKey: 1 },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updated) throw new VerificationAbort("state_changed");
        await VerificationUpload.updateMany(
          { attachedRecordId: recordId, ownerId: record.userId },
          { $set: { purgeAt: now, updatedAt: now } },
          { session, runValidators: true },
        );
        await AuditLog.create(
          [
            {
              actorId: reviewerId,
              action:
                decision === "approve"
                  ? "identity_verification_approved"
                  : "identity_verification_rejected",
              targetType: "verification_record",
              targetId: recordId,
              metadata: { fromStatus: "pending", toStatus: updated.status },
              ipHash,
              createdAt: now,
            },
          ],
          { session },
        );
        notification = await createNotification({
          recipientId: record.userId,
          kind:
            decision === "approve" ? "identity_approved" : "identity_rejected",
          resourceType: "verification",
          resourceId: recordId,
          now,
          session,
        });
        outcome = "decided";
      });
    } catch (error) {
      if (error instanceof VerificationAbort) outcome = error.outcome;
      else throw error;
    }
    return { outcome, record: updated, notification };
  }

  async expirePending(now = new Date()) {
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const old = await VerificationRecord.find({
      status: "pending",
      submittedAt: { $lte: cutoff },
    })
      .select("_id")
      .limit(50)
      .lean()
      .exec();
    let expired = 0;
    for (const row of old) {
      let changed = false;
      await mongoose.connection.transaction(async (session) => {
        changed = false;
        const updated = await VerificationRecord.findOneAndUpdate(
          {
            _id: row._id,
            status: "pending",
            submittedAt: { $lte: cutoff },
          },
          {
            $set: {
              status: "expired",
              expiredAt: now,
              claimBy: null,
              claimExpiresAt: null,
              updatedAt: now,
            },
            $unset: { activeKey: 1 },
          },
          { new: true, session, runValidators: true },
        )
          .select("_id")
          .lean()
          .exec();
        if (!updated) return;
        await VerificationUpload.updateMany(
          { attachedRecordId: row._id },
          { $set: { purgeAt: now, updatedAt: now } },
          { session, runValidators: true },
        );
        changed = true;
      });
      if (changed) expired += 1;
    }
    return expired;
  }
}
