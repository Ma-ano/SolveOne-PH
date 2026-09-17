function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function serializeNeedItem(item) {
  const solvedQuantity = item.solvedQuantity ?? 0;
  const reservedQuantity = item.reservedQuantity ?? 0;
  const solvedValueCentavos = item.solvedValueCentavos ?? 0;
  const reservedValueCentavos = item.reservedValueCentavos ?? 0;
  return {
    id: idOf(item),
    name: item.name,
    description: item.description,
    type: item.type,
    quantity: item.quantity,
    estimatedValueCentavos: item.estimatedValueCentavos,
    estimatedMinutes: item.estimatedMinutes ?? null,
    solvedQuantity,
    reservedQuantity,
    remainingQuantity: Math.max(
      0,
      (item.quantity ?? 0) - solvedQuantity - reservedQuantity,
    ),
    solvedValueCentavos,
    reservedValueCentavos,
    remainingValueCentavos: Math.max(
      0,
      (item.estimatedValueCentavos ?? 0) -
        solvedValueCentavos -
        reservedValueCentavos,
    ),
  };
}

export function serializeDiscoveryRequest(request) {
  const serialized = serializePublicRequest(request);
  if (!serialized) return null;
  const reasons = [];
  if (request.discoverySkillMatch > 0)
    reasons.push(
      `${request.discoverySkillMatch} selected skill${request.discoverySkillMatch === 1 ? "" : "s"} matched`,
    );
  if (request.discoveryVerifiedRank > 0)
    reasons.push("Owner has a factual verification badge");
  if (request.discoveryUrgencyRank === 2) reasons.push("Time-sensitive need");
  else if (request.discoveryUrgencyRank === 1) reasons.push("Important need");
  if (request.discoveryNearbyRank === 2) reasons.push("Same city");
  else if (request.discoveryNearbyRank === 1) reasons.push("Same province");

  return {
    ...serialized,
    discovery: {
      matchedSkills: request.discoveryMatchedSkills ?? [],
      estimatedMinutes: request.discoveryEstimatedMinutes ?? null,
      remainingBudgetCentavos: request.discoveryRemainingBudgetCentavos ?? null,
      nearbyLevel:
        request.discoveryNearbyRank === 2
          ? "same_city"
          : request.discoveryNearbyRank === 1
            ? "same_province"
            : "not_nearby",
      reasons,
    },
  };
}

function serializeProgress(needItems) {
  return needItems.reduce(
    (progress, item) => ({
      solvedQuantity: progress.solvedQuantity + item.solvedQuantity,
      reservedQuantity: progress.reservedQuantity + item.reservedQuantity,
      solvedValueCentavos:
        progress.solvedValueCentavos + item.solvedValueCentavos,
      reservedValueCentavos:
        progress.reservedValueCentavos + item.reservedValueCentavos,
    }),
    {
      solvedQuantity: 0,
      reservedQuantity: 0,
      solvedValueCentavos: 0,
      reservedValueCentavos: 0,
    },
  );
}

function serializeOwner(owner) {
  if (!owner || typeof owner !== "object") {
    return null;
  }

  const lastInitial = owner.lastName?.trim().charAt(0);
  return {
    id: idOf(owner),
    displayName: lastInitial
      ? `${owner.firstName} ${lastInitial.toLocaleUpperCase("en")}.`
      : owner.firstName,
    verificationLevel: owner.verification?.level ?? "UNVERIFIED",
  };
}

function serializeBase(request) {
  const needItems = (request.needItems ?? []).map(serializeNeedItem);
  return {
    id: idOf(request),
    title: request.title,
    description: request.description,
    category: request.category,
    helpTypes: [...(request.helpTypes ?? [])],
    visibility: request.visibility,
    urgency: request.urgency,
    neededBy: timestamp(request.neededBy),
    estimatedValueCentavos: request.estimatedValueCentavos ?? 0,
    currency: request.currency ?? "PHP",
    needItems,
    progress: serializeProgress(needItems),
    requiredSkills: [...(request.requiredSkills ?? [])],
    status: request.status,
    publishedAt: timestamp(request.publishedAt),
    solvedAt: timestamp(request.solvedAt),
    createdAt: timestamp(request.createdAt),
    updatedAt: timestamp(request.updatedAt),
  };
}

export function serializePublicRequest(request) {
  const owner = serializeOwner(request.ownerId);
  if (!owner) {
    return null;
  }

  return {
    ...serializeBase(request),
    owner,
    publicLocation: {
      city: request.publicLocation?.city ?? null,
      province: request.publicLocation?.province ?? null,
    },
  };
}

export function serializeOwnedRequest(request) {
  return {
    ...serializeBase(request),
    ownerId: idOf(request.ownerId),
    location: {
      country: request.location?.country ?? null,
      province: request.location?.province ?? null,
      city: request.location?.city ?? null,
      barangay: request.location?.barangay ?? null,
    },
    moderation: {
      submittedAt: timestamp(request.moderation?.submittedAt),
      reviewedAt: timestamp(request.moderation?.reviewedAt),
      notes: request.moderation?.notes ?? null,
    },
    verificationRequirements: [...(request.verificationRequirements ?? [])],
  };
}

export function serializeModerationRequest(request) {
  const owner = serializeOwner(request.ownerId);
  return {
    ...serializeOwnedRequest(request),
    owner,
    safetyFlags: [...(request.safetyFlags ?? [])],
  };
}
