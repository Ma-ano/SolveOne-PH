import {
  serializeAuditLog,
  serializeBlockedUser,
  serializeOwnReport,
  serializeQueueReport,
  serializeReportDetail,
} from "../serializers/safety.serializer.js";
import { AppError } from "../utils/AppError.js";
import { hashIpAddress } from "../utils/authCrypto.js";
import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";

function safetyError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

function pageInfo(page, scope, field = "createdAt") {
  const last = page.items.at(-1);
  return {
    hasNextPage: page.hasNextPage,
    nextCursor:
      page.hasNextPage && last
        ? encodePageCursor({ scope, date: last[field], id: last._id })
        : null,
  };
}

function serializeAccount(user) {
  return {
    id: String(user._id),
    accountStatus: user.accountStatus,
    suspendedAt: user.suspendedAt
      ? new Date(user.suspendedAt).toISOString()
      : null,
    reinstatedAt: user.reinstatedAt
      ? new Date(user.reinstatedAt).toISOString()
      : null,
  };
}

export class SafetyService {
  constructor({ repository, config, clock = () => new Date() }) {
    this.repository = repository;
    this.config = config;
    this.clock = clock;
  }

  ipHash(ipAddress) {
    return hashIpAddress(ipAddress, this.config.ipHashSecret);
  }

  requireReviewer(actor) {
    if (!["moderator", "admin"].includes(actor.role)) {
      throw safetyError(403, "FORBIDDEN", "Moderation permission is required");
    }
  }

  requireAdmin(actor) {
    if (actor.role !== "admin") {
      throw safetyError(
        403,
        "FORBIDDEN",
        "Administrator permission is required",
      );
    }
  }

  async reportUser(reporterId, userId, input) {
    const result = await this.repository.reportUser({
      reporterId,
      targetId: userId,
      ...input,
      now: this.clock(),
    });
    if (result.outcome === "not_found") {
      throw safetyError(404, "USER_NOT_FOUND", "User not found");
    }
    return {
      report: serializeOwnReport(result.report),
      duplicate: result.outcome === "duplicate",
    };
  }

  async reportRequest(reporterId, requestId, input) {
    const result = await this.repository.reportRequest({
      reporterId,
      targetId: requestId,
      ...input,
      now: this.clock(),
    });
    if (result.outcome === "not_found") {
      throw safetyError(404, "REQUEST_NOT_FOUND", "Request not found");
    }
    return {
      report: serializeOwnReport(result.report),
      duplicate: result.outcome === "duplicate",
    };
  }

  async reportGiveaway(reporterId, itemId, input) {
    const result = await this.repository.reportGiveaway({
      reporterId,
      targetId: itemId,
      ...input,
      now: this.clock(),
    });
    if (result.outcome === "not_found")
      throw safetyError(404, "GIVEAWAY_NOT_FOUND", "Giveaway item not found");
    return {
      report: serializeOwnReport(result.report),
      duplicate: result.outcome === "duplicate",
    };
  }

  async reportMission(reporterId, missionId, input) {
    const result = await this.repository.reportMission({
      reporterId,
      targetId: missionId,
      ...input,
      now: this.clock(),
    });
    if (result.outcome === "not_found")
      throw safetyError(
        404,
        "MISSION_NOT_FOUND",
        "Community mission not found",
      );
    return {
      report: serializeOwnReport(result.report),
      duplicate: result.outcome === "duplicate",
    };
  }

  async blockUser(blockerId, blockedId, context) {
    const result = await this.repository.blockUser({
      blockerId,
      blockedId,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (result.outcome === "not_found") {
      throw safetyError(404, "USER_NOT_FOUND", "User not found");
    }
    return {
      blockedUserId: String(blockedId),
      duplicate: result.outcome === "duplicate",
    };
  }

  async unblockUser(blockerId, blockedId, context) {
    const result = await this.repository.unblockUser({
      blockerId,
      blockedId,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (result.outcome === "not_found") {
      throw safetyError(404, "BLOCK_NOT_FOUND", "Block not found");
    }
    return { blockedUserId: String(blockedId), removed: true };
  }

  async listBlocks(blockerId, query) {
    const scope = `blocks:${blockerId}`;
    const page = await this.repository.listBlocks({
      blockerId,
      limit: query.limit,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return {
      items: page.items.map(serializeBlockedUser),
      pageInfo: pageInfo(page, scope),
    };
  }

  async listReports(actor, query) {
    this.requireReviewer(actor);
    const scope = `reports:${actor.userId}:${query.status}:${query.targetType ?? ""}`;
    const page = await this.repository.listReports({
      ...query,
      reviewerId: actor.userId,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return {
      items: page.items.map((report) =>
        serializeQueueReport(report, actor.userId, this.clock()),
      ),
      pageInfo: pageInfo(page, scope),
    };
  }

  async claimReport(actor, reportId, context) {
    this.requireReviewer(actor);
    const result = await this.repository.claimReport({
      reviewerId: actor.userId,
      reportId,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (result.outcome === "claimed_elsewhere") {
      throw safetyError(
        409,
        "REPORT_CLAIMED",
        "Another moderator currently has this report",
      );
    }
    if (result.outcome !== "claimed") {
      throw safetyError(404, "REPORT_NOT_FOUND", "Report not found");
    }
    return {
      report: serializeQueueReport(result.report, actor.userId, this.clock()),
    };
  }

  async reportDetail(actor, reportId, context) {
    this.requireReviewer(actor);
    const result = await this.repository.readReportEvidence({
      reviewerId: actor.userId,
      reportId,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (!result) {
      throw safetyError(404, "REPORT_NOT_FOUND", "Report not found");
    }
    return serializeReportDetail(result.report, result.evidence);
  }

  async resolveReport(actor, reportId, input, context) {
    this.requireReviewer(actor);
    const report = await this.repository.resolveReport({
      reviewerId: actor.userId,
      reportId,
      ...input,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (!report) {
      throw safetyError(
        409,
        "REPORT_STATE_CHANGED",
        "The report claim expired or its state changed",
      );
    }
    return { report: serializeOwnReport(report) };
  }

  async suspendUser(actor, userId, reason, context) {
    this.requireAdmin(actor);
    const user = await this.repository.suspendUser({
      actorId: actor.userId,
      userId,
      reason,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (!user) {
      throw safetyError(
        409,
        "ACCOUNT_NOT_SUSPENDABLE",
        "The account cannot be suspended from its current state",
      );
    }
    return { user: serializeAccount(user) };
  }

  async reinstateUser(actor, userId, reason, context) {
    this.requireAdmin(actor);
    const user = await this.repository.reinstateUser({
      actorId: actor.userId,
      userId,
      reason,
      ipHash: this.ipHash(context?.ipAddress),
      now: this.clock(),
    });
    if (!user) {
      throw safetyError(
        409,
        "ACCOUNT_NOT_REINSTATABLE",
        "The account cannot be reinstated from its current state",
      );
    }
    return { user: serializeAccount(user) };
  }

  async listAuditLogs(actor, query) {
    this.requireAdmin(actor);
    const scope = `audit:${query.actorId ?? ""}:${query.action ?? ""}:${query.targetType ?? ""}`;
    const page = await this.repository.listAuditLogs({
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return {
      items: page.items.map(serializeAuditLog),
      pageInfo: pageInfo(page, scope),
    };
  }
}
