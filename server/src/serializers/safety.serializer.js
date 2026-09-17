function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function displayName(user) {
  if (!user || typeof user !== "object") return null;
  const initial = user.lastName?.trim().charAt(0)?.toLocaleUpperCase("en");
  return initial ? `${user.firstName} ${initial}.` : user.firstName;
}

function serializeReviewPerson(user) {
  if (!user || typeof user !== "object") return null;
  return {
    id: idOf(user),
    displayName: displayName(user),
    role: user.role,
    accountStatus: user.accountStatus,
    verificationLevel: user.verification?.level ?? "UNVERIFIED",
  };
}

export function serializeOwnReport(report) {
  return {
    id: idOf(report),
    targetType: report.targetType,
    targetId: idOf(report.targetId),
    reason: report.reason,
    description: report.description ?? null,
    status: report.status,
    createdAt: timestamp(report.createdAt),
  };
}

export function serializeQueueReport(report, actorId, now = new Date()) {
  const assignedId = report.assignedModerator
    ? idOf(report.assignedModerator)
    : null;
  return {
    id: idOf(report),
    targetType: report.targetType,
    targetId: idOf(report.targetId),
    reason: report.reason,
    status: report.status,
    assignedToMe: assignedId === String(actorId),
    claimExpiresAt: timestamp(report.claimExpiresAt),
    claimExpired: Boolean(
      report.claimExpiresAt && new Date(report.claimExpiresAt) <= now,
    ),
    createdAt: timestamp(report.createdAt),
  };
}

export function serializeReportDetail(report, evidence) {
  return {
    report: {
      id: idOf(report),
      targetType: report.targetType,
      targetId: idOf(report.targetId),
      reason: report.reason,
      description: report.description ?? null,
      status: report.status,
      reportedUser: serializeReviewPerson(report.reportedUserId),
      claimExpiresAt: timestamp(report.claimExpiresAt),
      createdAt: timestamp(report.createdAt),
    },
    evidence,
  };
}

export function serializeBlockedUser(block) {
  return {
    id: idOf(block),
    user: block.blockedId
      ? {
          id: idOf(block.blockedId),
          displayName: displayName(block.blockedId),
          verificationLevel:
            block.blockedId.verification?.level ?? "UNVERIFIED",
        }
      : null,
    createdAt: timestamp(block.createdAt),
  };
}

export function serializeAuditLog(entry) {
  return {
    id: idOf(entry),
    actor: entry.actorId
      ? {
          id: idOf(entry.actorId),
          displayName: displayName(entry.actorId),
          role: entry.actorId.role,
        }
      : null,
    action: entry.action,
    targetType: entry.targetType,
    targetId: idOf(entry.targetId),
    createdAt: timestamp(entry.createdAt),
  };
}
