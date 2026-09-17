function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function person(user) {
  if (!user || typeof user !== "object") return null;
  const initial = user.lastName?.trim().charAt(0).toLocaleUpperCase("en");
  return {
    id: idOf(user),
    displayName: initial ? `${user.firstName} ${initial}.` : user.firstName,
    verificationLevel: user.verification?.level ?? "UNVERIFIED",
  };
}

function resource(item) {
  const reservedQuantity = item.reservedQuantity ?? 0;
  const fulfilledQuantity = item.fulfilledQuantity ?? 0;
  return {
    id: idOf(item),
    name: item.name,
    description: item.description,
    type: item.type,
    quantity: item.quantity,
    reservedQuantity,
    fulfilledQuantity,
    remainingQuantity: Math.max(
      0,
      item.quantity - reservedQuantity - fulfilledQuantity,
    ),
    estimatedMinutes: item.estimatedMinutes ?? null,
    requiredSkills: [...(item.requiredSkills ?? [])],
  };
}

function base(mission) {
  return {
    id: idOf(mission),
    title: mission.title,
    description: mission.description,
    category: mission.category,
    requiredResources: (mission.requiredResources ?? []).map(resource),
    verificationStatus: mission.verificationStatus,
    status: mission.status,
    publishedAt: timestamp(mission.publishedAt),
    completedAt: timestamp(mission.completedAt),
    createdAt: timestamp(mission.createdAt),
    updatedAt: timestamp(mission.updatedAt),
  };
}

export function serializePublicMission(mission) {
  const creator = person(mission?.creatorId);
  if (!creator || mission.verificationStatus !== "verified") return null;
  return {
    ...base(mission),
    creator,
    publicLocation: {
      city: mission.publicLocation?.city ?? null,
      province: mission.publicLocation?.province ?? null,
    },
  };
}

export function serializeMatchedMission(mission) {
  const serialized = serializePublicMission(mission);
  if (!serialized) return null;
  return {
    ...serialized,
    match: {
      matchedSkills: mission.match?.matchedSkills ?? [],
      locationLevel: mission.match?.locationLevel ?? "not_nearby",
      reasons: mission.match?.reasons ?? [],
    },
  };
}

export function serializeOwnedMission(mission) {
  return {
    ...base(mission),
    creatorId: idOf(mission.creatorId),
    location: {
      country: mission.location?.country ?? null,
      province: mission.location?.province ?? null,
      city: mission.location?.city ?? null,
      barangay: mission.location?.barangay ?? null,
    },
    evidence: { note: mission.evidence?.note ?? null },
    moderation: {
      submittedAt: timestamp(mission.moderation?.submittedAt),
      reviewedAt: timestamp(mission.moderation?.reviewedAt),
      notes: mission.moderation?.notes ?? null,
    },
  };
}

export function serializeModerationMission(mission) {
  return {
    ...serializeOwnedMission(mission),
    creator: person(mission.creatorId),
    safetyFlags: [...(mission.safetyFlags ?? [])],
  };
}

function missionSummary(mission, resourceId) {
  if (!mission || typeof mission !== "object") return null;
  const selected = mission.requiredResources?.find(
    (candidate) => idOf(candidate) === String(resourceId),
  );
  return {
    id: idOf(mission),
    title: mission.title,
    status: mission.status,
    publicLocation: {
      city: mission.publicLocation?.city ?? null,
      province: mission.publicLocation?.province ?? null,
    },
    resource: selected ? resource(selected) : null,
  };
}

export function serializeMissionContribution(contribution) {
  return {
    id: idOf(contribution),
    missionId: idOf(contribution.missionId),
    creatorId: idOf(contribution.creatorId),
    contributorId: idOf(contribution.contributorId),
    resourceId: idOf(contribution.resourceId),
    resourceType: contribution.resourceType,
    message: contribution.message,
    quantity: contribution.quantity,
    estimatedMinutes: contribution.estimatedMinutes ?? null,
    actualMinutes: contribution.actualMinutes ?? null,
    completionNote: contribution.completionNote ?? null,
    status: contribution.status,
    acceptedAt: timestamp(contribution.acceptedAt),
    startedAt: timestamp(contribution.startedAt),
    completionSubmittedAt: timestamp(contribution.completionSubmittedAt),
    completedAt: timestamp(contribution.completedAt),
    createdAt: timestamp(contribution.createdAt),
    updatedAt: timestamp(contribution.updatedAt),
    creator: person(contribution.creatorId),
    contributor: person(contribution.contributorId),
    mission: missionSummary(contribution.missionId, contribution.resourceId),
  };
}
