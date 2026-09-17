function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function requesterSummary(requester, { includeEmail = false } = {}) {
  if (!requester || typeof requester !== "object") return null;
  const initial = requester.lastName?.trim().charAt(0)?.toLocaleUpperCase("en");
  return {
    id: idOf(requester),
    displayName: initial
      ? `${requester.firstName} ${initial}.`
      : requester.firstName,
    accountStatus: requester.accountStatus,
    ...(includeEmail ? { email: requester.email } : {}),
  };
}

export function serializeOwnPrivacyRequest(request) {
  return {
    id: idOf(request),
    requestType: request.requestType,
    details: request.details,
    status: request.status,
    privacyPolicyVersion: request.privacyPolicyVersion,
    claimedAt: timestamp(request.claimedAt),
    resolutionSummary: request.resolutionSummary ?? null,
    resolvedAt: timestamp(request.resolvedAt),
    createdAt: timestamp(request.createdAt),
    updatedAt: timestamp(request.updatedAt),
  };
}

export function serializePrivacyRequestQueueItem(request, actorId) {
  return {
    id: idOf(request),
    requestType: request.requestType,
    status: request.status,
    requester: requesterSummary(request.requesterId),
    assignedToMe: Boolean(
      request.assignedAdminId &&
      idOf(request.assignedAdminId) === String(actorId),
    ),
    createdAt: timestamp(request.createdAt),
    updatedAt: timestamp(request.updatedAt),
  };
}

export function serializePrivacyRequestDetail(request, actorId) {
  return {
    ...serializeOwnPrivacyRequest(request),
    requester: requesterSummary(request.requesterId, { includeEmail: true }),
    assignedToMe: Boolean(
      request.assignedAdminId &&
      idOf(request.assignedAdminId) === String(actorId),
    ),
  };
}
