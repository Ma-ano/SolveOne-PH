function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

export function serializeOwnVerification(record) {
  if (!record) return null;
  return {
    id: idOf(record),
    type: record.type,
    status: record.status,
    documentCount: record.documents?.length ?? 0,
    submittedAt: timestamp(record.submittedAt),
    reviewedAt: timestamp(record.reviewedAt),
    rejectionReason: record.rejectionReason ?? null,
    documentsPurgedAt: timestamp(record.documentsPurgedAt),
  };
}

export function serializeReviewVerification(record, reviewerId, now) {
  const owner = record.userId;
  return {
    id: idOf(record),
    status: record.status,
    owner: {
      id: idOf(owner),
      displayName:
        owner?.firstName && owner?.lastName
          ? `${owner.firstName} ${owner.lastName}`
          : null,
    },
    documents: (record.documents ?? []).map((document) => ({
      id: idOf(document.uploadId),
      mimeType: document.mimeType,
      size: document.size,
    })),
    submittedAt: timestamp(record.submittedAt),
    claimState:
      idOf(record.claimBy) === String(reviewerId) && record.claimExpiresAt > now
        ? "mine"
        : record.claimBy && record.claimExpiresAt > now
          ? "busy"
          : "available",
    claimExpiresAt:
      idOf(record.claimBy) === String(reviewerId)
        ? timestamp(record.claimExpiresAt)
        : null,
  };
}
