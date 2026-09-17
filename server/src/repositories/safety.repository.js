import mongoose from "mongoose";

import { AuditLog } from "../models/AuditLog.js";
import { CommunityMission } from "../models/CommunityMission.js";
import { HelpRequest } from "../models/HelpRequest.js";
import { GiveawayItem } from "../models/GiveawayItem.js";
import { Message } from "../models/Message.js";
import { RefreshSession } from "../models/RefreshSession.js";
import { Report } from "../models/Report.js";
import { User } from "../models/User.js";
import { UserBlock } from "../models/UserBlock.js";
import { createReportActiveKey } from "../utils/reportKey.js";

const CLAIM_MILLISECONDS = 30 * 60 * 1000;

function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function withCursor(filter, field, cursor, direction) {
  if (!cursor) return filter;
  const comparison = direction === 1 ? "$gt" : "$lt";
  return {
    ...filter,
    $or: [
      { [field]: { [comparison]: cursor.date } },
      { [field]: cursor.date, _id: { [comparison]: cursor.id } },
    ],
  };
}

async function runPage(query, limit) {
  const rows = await query
    .limit(limit + 1)
    .lean()
    .exec();
  return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
}

async function createReport({
  reporterId,
  targetType,
  targetId,
  reportedUserId,
  reason,
  description,
  now,
}) {
  const activeKey = createReportActiveKey({ reporterId, targetType, targetId });
  try {
    const report = await Report.create({
      reporterId,
      targetType,
      targetId,
      reportedUserId,
      reason,
      description: description ?? null,
      status: "open",
      activeKey,
      createdAt: now,
      updatedAt: now,
    });
    return { outcome: "created", report: report.toObject() };
  } catch (error) {
    if (error?.code !== 11000) throw error;
    return {
      outcome: "duplicate",
      report: await Report.findOne({ activeKey }).lean().exec(),
    };
  }
}

function auditEntry({
  actorId,
  action,
  targetType,
  targetId,
  metadata,
  ipHash,
  now,
}) {
  return {
    actorId,
    action,
    targetType,
    targetId,
    metadata: metadata ?? {},
    ipHash,
    createdAt: now,
  };
}

export class SafetyRepository {
  async reportUser(input) {
    const target = await User.findOne({
      _id: input.targetId,
      accountStatus: "active",
    })
      .select("_id")
      .lean()
      .exec();
    if (!target || idOf(target) === String(input.reporterId)) {
      return { outcome: "not_found", report: null };
    }
    return createReport({
      ...input,
      targetType: "user",
      reportedUserId: target._id,
    });
  }

  async reportRequest(input) {
    const target = await HelpRequest.findOne({
      _id: input.targetId,
      status: { $in: ["published", "partially_solved", "solved"] },
      visibility: "public",
    })
      .select("_id ownerId")
      .lean()
      .exec();
    const owner = target
      ? await User.findOne({ _id: target.ownerId, accountStatus: "active" })
          .select("_id")
          .lean()
          .exec()
      : null;
    if (
      !target ||
      !owner ||
      idOf(target.ownerId) === String(input.reporterId)
    ) {
      return { outcome: "not_found", report: null };
    }
    return createReport({
      ...input,
      targetType: "request",
      reportedUserId: target.ownerId,
    });
  }

  async reportGiveaway(input) {
    const target = await GiveawayItem.findOne({
      _id: input.targetId,
      status: { $ne: "removed" },
    })
      .select("_id ownerId")
      .lean()
      .exec();
    const owner = target
      ? await User.findOne({ _id: target.ownerId, accountStatus: "active" })
          .select("_id")
          .lean()
          .exec()
      : null;
    if (!target || !owner || idOf(target.ownerId) === String(input.reporterId))
      return { outcome: "not_found", report: null };
    return createReport({
      ...input,
      targetType: "giveaway_item",
      reportedUserId: target.ownerId,
    });
  }

  async reportMission(input) {
    const target = await CommunityMission.findOne({
      _id: input.targetId,
      status: { $in: ["published", "in_progress", "completed"] },
      verificationStatus: "verified",
    })
      .select("_id creatorId")
      .lean()
      .exec();
    const creator = target
      ? await User.findOne({
          _id: target.creatorId,
          accountStatus: "active",
        })
          .select("_id")
          .lean()
          .exec()
      : null;
    if (
      !target ||
      !creator ||
      idOf(target.creatorId) === String(input.reporterId)
    )
      return { outcome: "not_found", report: null };
    return createReport({
      ...input,
      targetType: "community_mission",
      reportedUserId: target.creatorId,
    });
  }

  async blockUser({ blockerId, blockedId, ipHash, now }) {
    const target = await User.findOne({
      _id: blockedId,
      accountStatus: "active",
    })
      .select("_id")
      .lean()
      .exec();
    if (!target || String(blockerId) === String(blockedId)) {
      return { outcome: "not_found", block: null };
    }
    try {
      let block = null;
      await mongoose.connection.transaction(async (session) => {
        [block] = await UserBlock.create(
          [{ blockerId, blockedId, createdAt: now }],
          { session },
        );
        await AuditLog.create(
          [
            auditEntry({
              actorId: blockerId,
              action: "user_blocked",
              targetType: "user",
              targetId: blockedId,
              ipHash,
              now,
            }),
          ],
          { session },
        );
      });
      return { outcome: "created", block: block.toObject() };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return {
        outcome: "duplicate",
        block: await UserBlock.findOne({ blockerId, blockedId }).lean().exec(),
      };
    }
  }

  async unblockUser({ blockerId, blockedId, ipHash, now }) {
    let removed = null;
    await mongoose.connection.transaction(async (session) => {
      removed = await UserBlock.findOneAndDelete(
        { blockerId, blockedId },
        { session },
      )
        .lean()
        .exec();
      if (!removed) return;
      await AuditLog.create(
        [
          auditEntry({
            actorId: blockerId,
            action: "user_unblocked",
            targetType: "user",
            targetId: blockedId,
            ipHash,
            now,
          }),
        ],
        { session },
      );
    });
    return { outcome: removed ? "removed" : "not_found" };
  }

  listBlocks({ blockerId, cursor, limit }) {
    return runPage(
      UserBlock.find(withCursor({ blockerId }, "createdAt", cursor, -1))
        .sort({ createdAt: -1, _id: -1 })
        .populate({
          path: "blockedId",
          select: "firstName lastName verification.level",
        }),
      limit,
    );
  }

  listReports({ reviewerId, status, targetType, cursor, limit }) {
    const filter = {
      status,
      reporterId: { $ne: reviewerId },
      reportedUserId: { $ne: reviewerId },
      ...(targetType ? { targetType } : {}),
    };
    return runPage(
      Report.find(withCursor(filter, "createdAt", cursor, 1)).sort({
        createdAt: 1,
        _id: 1,
      }),
      limit,
    );
  }

  async claimReport({ reviewerId, reportId, ipHash, now }) {
    let outcome = "not_found";
    let claimed = null;
    await mongoose.connection.transaction(async (session) => {
      const report = await Report.findOne({
        _id: reportId,
        status: { $in: ["open", "reviewing"] },
        reporterId: { $ne: reviewerId },
        reportedUserId: { $ne: reviewerId },
      })
        .session(session)
        .lean()
        .exec();
      if (!report) return;
      if (
        idOf(report.assignedModerator) === String(reviewerId) &&
        report.claimExpiresAt > now
      ) {
        outcome = "claimed";
        claimed = report;
        return;
      }
      claimed = await Report.findOneAndUpdate(
        {
          _id: reportId,
          status: { $in: ["open", "reviewing"] },
          reporterId: { $ne: reviewerId },
          reportedUserId: { $ne: reviewerId },
          $or: [{ assignedModerator: null }, { claimExpiresAt: { $lte: now } }],
        },
        {
          $set: {
            status: "reviewing",
            assignedModerator: reviewerId,
            claimedAt: now,
            claimExpiresAt: new Date(now.getTime() + CLAIM_MILLISECONDS),
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
          auditEntry({
            actorId: reviewerId,
            action: "report_claimed",
            targetType: "report",
            targetId: reportId,
            ipHash,
            now,
          }),
        ],
        { session },
      );
      outcome = "claimed";
    });
    return { outcome, report: claimed };
  }

  async readReportEvidence({ reviewerId, reportId, ipHash, now }) {
    const report = await Report.findOne({
      _id: reportId,
      status: "reviewing",
      assignedModerator: reviewerId,
      claimExpiresAt: { $gt: now },
      reporterId: { $ne: reviewerId },
      reportedUserId: { $ne: reviewerId },
    })
      .select("+conversationId")
      .populate({
        path: "reportedUserId",
        select: "firstName lastName role accountStatus verification.level",
      })
      .lean()
      .exec();
    if (!report) return null;

    let evidence = null;
    if (report.targetType === "message") {
      const message = await Message.findOne({
        _id: report.targetId,
        conversationId: report.conversationId,
      })
        .select(
          "+safetyFlags senderId type content createdAt editedAt deletedAt",
        )
        .lean()
        .exec();
      if (message) {
        evidence = {
          type: "message",
          id: idOf(message),
          senderId: idOf(message.senderId),
          messageType: message.type,
          content: message.deletedAt ? null : message.content,
          removed: Boolean(message.deletedAt),
          automatedFlags: message.safetyFlags ?? [],
          createdAt: new Date(message.createdAt).toISOString(),
        };
      }
    } else if (report.targetType === "request") {
      const request = await HelpRequest.findById(report.targetId)
        .select(
          "title description category helpTypes urgency publicLocation status createdAt ownerId",
        )
        .lean()
        .exec();
      if (request) {
        evidence = {
          type: "request",
          id: idOf(request),
          ownerId: idOf(request.ownerId),
          title: request.title,
          description: request.description,
          category: request.category,
          helpTypes: request.helpTypes,
          urgency: request.urgency,
          publicLocation: request.publicLocation,
          status: request.status,
          createdAt: new Date(request.createdAt).toISOString(),
        };
      }
    } else if (report.targetType === "giveaway_item") {
      const item = await GiveawayItem.findById(report.targetId)
        .select(
          "title description category condition quantity publicLocation status createdAt ownerId",
        )
        .lean()
        .exec();
      if (item) {
        evidence = {
          type: "giveaway_item",
          id: idOf(item),
          ownerId: idOf(item.ownerId),
          title: item.title,
          description: item.description,
          category: item.category,
          condition: item.condition,
          quantity: item.quantity,
          publicLocation: item.publicLocation,
          status: item.status,
          createdAt: new Date(item.createdAt).toISOString(),
        };
      }
    } else if (report.targetType === "community_mission") {
      const mission = await CommunityMission.findById(report.targetId)
        .select(
          "title description category requiredResources publicLocation verificationStatus status createdAt creatorId",
        )
        .lean()
        .exec();
      if (mission) {
        evidence = {
          type: "community_mission",
          id: idOf(mission),
          creatorId: idOf(mission.creatorId),
          title: mission.title,
          description: mission.description,
          category: mission.category,
          requiredResources: mission.requiredResources.map((resource) => ({
            id: idOf(resource),
            name: resource.name,
            description: resource.description,
            type: resource.type,
            quantity: resource.quantity,
          })),
          publicLocation: mission.publicLocation,
          verificationStatus: mission.verificationStatus,
          status: mission.status,
          createdAt: new Date(mission.createdAt).toISOString(),
        };
      }
    } else if (report.targetType === "user") {
      const user = await User.findById(report.targetId)
        .select(
          "firstName lastName role accountStatus bio skills verification.level createdAt",
        )
        .lean()
        .exec();
      if (user) {
        evidence = {
          type: "user",
          id: idOf(user),
          displayName:
            `${user.firstName} ${user.lastName?.charAt(0) ?? ""}.`.trim(),
          role: user.role,
          accountStatus: user.accountStatus,
          bio: user.bio ?? null,
          skills: user.skills ?? [],
          verificationLevel: user.verification?.level ?? "UNVERIFIED",
          createdAt: new Date(user.createdAt).toISOString(),
        };
      }
    }
    if (!evidence) return null;
    await AuditLog.create(
      auditEntry({
        actorId: reviewerId,
        action: "report_evidence_accessed",
        targetType: "report",
        targetId: reportId,
        metadata: { evidenceType: report.targetType },
        ipHash,
        now,
      }),
    );
    return { report, evidence };
  }

  async resolveReport({
    reviewerId,
    reportId,
    outcome,
    resolution,
    ipHash,
    now,
  }) {
    let updated = null;
    await mongoose.connection.transaction(async (session) => {
      updated = await Report.findOneAndUpdate(
        {
          _id: reportId,
          status: "reviewing",
          assignedModerator: reviewerId,
          claimExpiresAt: { $gt: now },
          reporterId: { $ne: reviewerId },
          reportedUserId: { $ne: reviewerId },
        },
        {
          $set: {
            status: outcome,
            resolution,
            resolvedBy: reviewerId,
            resolvedAt: now,
            assignedModerator: null,
            claimExpiresAt: null,
            updatedAt: now,
          },
          $unset: { activeKey: 1 },
        },
        { new: true, session, runValidators: true },
      )
        .lean()
        .exec();
      if (!updated) return;
      await AuditLog.create(
        [
          auditEntry({
            actorId: reviewerId,
            action:
              outcome === "resolved" ? "report_resolved" : "report_dismissed",
            targetType: "report",
            targetId: reportId,
            metadata: { targetType: updated.targetType },
            ipHash,
            now,
          }),
        ],
        { session },
      );
    });
    return updated;
  }

  async suspendUser({ actorId, userId, reason, ipHash, now }) {
    let updated = null;
    await mongoose.connection.transaction(async (session) => {
      updated = await User.findOneAndUpdate(
        {
          _id: { $eq: userId, $ne: actorId },
          role: { $ne: "admin" },
          accountStatus: "active",
        },
        {
          $set: {
            accountStatus: "suspended",
            suspendedAt: now,
            suspendedBy: actorId,
            suspensionReason: reason,
            updatedAt: now,
          },
        },
        { new: true, session, runValidators: true },
      )
        .select("+suspendedAt +suspendedBy +suspensionReason")
        .lean()
        .exec();
      if (!updated) return;
      await RefreshSession.updateMany(
        { userId, revokedAt: null },
        { $set: { revokedAt: now, updatedAt: now } },
        { session },
      );
      await AuditLog.create(
        [
          auditEntry({
            actorId,
            action: "user_suspended",
            targetType: "user",
            targetId: userId,
            metadata: { fromStatus: "active", toStatus: "suspended" },
            ipHash,
            now,
          }),
        ],
        { session },
      );
    });
    return updated;
  }

  async reinstateUser({ actorId, userId, reason, ipHash, now }) {
    let updated = null;
    await mongoose.connection.transaction(async (session) => {
      updated = await User.findOneAndUpdate(
        {
          _id: { $eq: userId, $ne: actorId },
          role: { $ne: "admin" },
          accountStatus: "suspended",
        },
        {
          $set: {
            accountStatus: "active",
            reinstatedAt: now,
            reinstatedBy: actorId,
            updatedAt: now,
          },
        },
        { new: true, session, runValidators: true },
      )
        .select("+reinstatedAt +reinstatedBy")
        .lean()
        .exec();
      if (!updated) return;
      await AuditLog.create(
        [
          auditEntry({
            actorId,
            action: "user_reinstated",
            targetType: "user",
            targetId: userId,
            metadata: {
              fromStatus: "suspended",
              toStatus: "active",
              reason,
            },
            ipHash,
            now,
          }),
        ],
        { session },
      );
    });
    return updated;
  }

  listAuditLogs({ cursor, limit, actorId, action, targetType }) {
    const filter = {
      ...(actorId ? { actorId } : {}),
      ...(action ? { action } : {}),
      ...(targetType ? { targetType } : {}),
    };
    return runPage(
      AuditLog.find(withCursor(filter, "createdAt", cursor, -1))
        .sort({ createdAt: -1, _id: -1 })
        .populate({ path: "actorId", select: "firstName lastName role" }),
      limit,
    );
  }
}
