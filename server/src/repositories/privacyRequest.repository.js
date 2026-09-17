import mongoose from "mongoose";

import { AuditLog } from "../models/AuditLog.js";
import { DataSubjectRequest } from "../models/DataSubjectRequest.js";

function withCursor(filter, cursor) {
  if (!cursor) return filter;
  return {
    ...filter,
    $or: [
      { createdAt: { $lt: cursor.date } },
      { createdAt: cursor.date, _id: { $lt: cursor.id } },
    ],
  };
}

async function page(query, limit) {
  const rows = await query
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean()
    .exec();
  return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
}

function activeKey(requesterId, requestType) {
  return `${requesterId}:${requestType}`;
}

function auditEntry({ actorId, action, targetId, metadata, ipHash, now }) {
  return {
    actorId,
    action,
    targetType: "data_subject_request",
    targetId,
    metadata: metadata ?? {},
    ipHash,
    createdAt: now,
  };
}

export class PrivacyRequestRepository {
  async submit({
    requesterId,
    requestType,
    details,
    privacyPolicyVersion,
    ipHash,
    now,
  }) {
    const key = activeKey(requesterId, requestType);
    let created;
    try {
      await mongoose.connection.transaction(async (session) => {
        [created] = await DataSubjectRequest.create(
          [
            {
              requesterId,
              requestType,
              details,
              privacyPolicyVersion,
              status: "submitted",
              activeKey: key,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { session },
        );
        await AuditLog.create(
          [
            auditEntry({
              actorId: requesterId,
              action: "data_subject_request_submitted",
              targetId: created._id,
              metadata: { requestType },
              ipHash,
              now,
            }),
          ],
          { session },
        );
      });
      return { outcome: "created", request: created.toObject() };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return {
        outcome: "duplicate",
        request: await DataSubjectRequest.findOne({ activeKey: key })
          .lean()
          .exec(),
      };
    }
  }

  listOwner({ requesterId, cursor, limit }) {
    return page(
      DataSubjectRequest.find(withCursor({ requesterId }, cursor)),
      limit,
    );
  }

  findOwner({ requesterId, requestId }) {
    return DataSubjectRequest.findOne({ _id: requestId, requesterId })
      .lean()
      .exec();
  }

  async cancel({ requesterId, requestId, ipHash, now }) {
    let changed;
    await mongoose.connection.transaction(async (session) => {
      changed = await DataSubjectRequest.findOneAndUpdate(
        {
          _id: requestId,
          requesterId,
          status: "submitted",
          assignedAdminId: null,
        },
        {
          $set: { status: "cancelled", updatedAt: now },
          $unset: { activeKey: 1 },
        },
        { new: true, runValidators: true, session },
      )
        .lean()
        .exec();
      if (changed)
        await AuditLog.create(
          [
            auditEntry({
              actorId: requesterId,
              action: "data_subject_request_cancelled",
              targetId: requestId,
              metadata: { requestType: changed.requestType },
              ipHash,
              now,
            }),
          ],
          { session },
        );
    });
    if (changed) return { outcome: "cancelled", request: changed };
    const existing = await this.findOwner({ requesterId, requestId });
    return {
      outcome: existing ? "unavailable" : "not_found",
      request: existing,
    };
  }

  listAdmin({ status, requestType, cursor, limit }) {
    const filter = { status, ...(requestType ? { requestType } : {}) };
    return page(
      DataSubjectRequest.find(withCursor(filter, cursor))
        .select("+assignedAdminId")
        .populate({
          path: "requesterId",
          select: "firstName lastName accountStatus",
        }),
      limit,
    );
  }

  findAdmin(requestId) {
    return DataSubjectRequest.findById(requestId)
      .select("+assignedAdminId")
      .populate({
        path: "requesterId",
        select: "firstName lastName email accountStatus",
      })
      .lean()
      .exec();
  }

  async claim({ actorId, requestId, ipHash, now }) {
    let changed;
    await mongoose.connection.transaction(async (session) => {
      changed = await DataSubjectRequest.findOneAndUpdate(
        { _id: requestId, status: "submitted", assignedAdminId: null },
        {
          $set: {
            status: "in_review",
            assignedAdminId: actorId,
            claimedAt: now,
            updatedAt: now,
          },
        },
        { new: true, runValidators: true, session },
      )
        .select("+assignedAdminId")
        .lean()
        .exec();
      if (changed)
        await AuditLog.create(
          [
            auditEntry({
              actorId,
              action: "data_subject_request_claimed",
              targetId: requestId,
              metadata: { requestType: changed.requestType },
              ipHash,
              now,
            }),
          ],
          { session },
        );
    });
    if (changed) return { outcome: "claimed", request: changed };
    const existing = await DataSubjectRequest.findById(requestId)
      .select("+assignedAdminId")
      .lean()
      .exec();
    if (!existing) return { outcome: "not_found", request: null };
    if (
      existing.status === "in_review" &&
      String(existing.assignedAdminId) === String(actorId)
    )
      return { outcome: "claimed", request: existing, duplicate: true };
    return { outcome: "unavailable", request: existing };
  }

  async release({ actorId, requestId, ipHash, now }) {
    let changed;
    await mongoose.connection.transaction(async (session) => {
      changed = await DataSubjectRequest.findOneAndUpdate(
        { _id: requestId, status: "in_review", assignedAdminId: actorId },
        {
          $set: { status: "submitted", claimedAt: null, updatedAt: now },
          $unset: { assignedAdminId: 1 },
        },
        { new: true, runValidators: true, session },
      )
        .select("+assignedAdminId")
        .lean()
        .exec();
      if (changed)
        await AuditLog.create(
          [
            auditEntry({
              actorId,
              action: "data_subject_request_released",
              targetId: requestId,
              metadata: { requestType: changed.requestType },
              ipHash,
              now,
            }),
          ],
          { session },
        );
    });
    if (changed) return { outcome: "released", request: changed };
    const existing = await DataSubjectRequest.findById(requestId)
      .select("+assignedAdminId")
      .lean()
      .exec();
    return {
      outcome: existing ? "unavailable" : "not_found",
      request: existing,
    };
  }

  async resolve({
    actorId,
    requestId,
    outcome,
    resolutionSummary,
    ipHash,
    now,
  }) {
    let changed;
    await mongoose.connection.transaction(async (session) => {
      changed = await DataSubjectRequest.findOneAndUpdate(
        { _id: requestId, status: "in_review", assignedAdminId: actorId },
        {
          $set: {
            status: outcome,
            resolutionSummary,
            resolvedBy: actorId,
            resolvedAt: now,
            updatedAt: now,
          },
          $unset: { activeKey: 1 },
        },
        { new: true, runValidators: true, session },
      )
        .select("+assignedAdminId")
        .lean()
        .exec();
      if (changed)
        await AuditLog.create(
          [
            auditEntry({
              actorId,
              action: `data_subject_request_${outcome}`,
              targetId: requestId,
              metadata: { requestType: changed.requestType },
              ipHash,
              now,
            }),
          ],
          { session },
        );
    });
    if (changed) return { outcome: "resolved", request: changed };
    const existing = await DataSubjectRequest.findById(requestId)
      .select("+assignedAdminId")
      .lean()
      .exec();
    return {
      outcome: existing ? "unavailable" : "not_found",
      request: existing,
    };
  }
}
