function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function serializePublicPerson(user) {
  if (!user || typeof user !== "object") {
    return null;
  }

  const lastInitial = user.lastName?.trim().charAt(0);
  return {
    id: idOf(user),
    displayName: lastInitial
      ? `${user.firstName} ${lastInitial.toLocaleUpperCase("en")}.`
      : user.firstName,
    verificationLevel: user.verification?.level ?? "UNVERIFIED",
  };
}

function serializeNeedSummary(request, needItemId) {
  const item = request?.needItems?.find(
    (candidate) => idOf(candidate) === String(needItemId),
  );
  if (!item) {
    return null;
  }

  return {
    id: idOf(item),
    name: item.name,
    type: item.type,
    quantity: item.quantity,
    estimatedValueCentavos: item.estimatedValueCentavos ?? 0,
  };
}

function serializeRequestSummary(request, needItemId) {
  if (!request || typeof request !== "object") {
    return null;
  }

  return {
    id: idOf(request),
    title: request.title,
    status: request.status,
    publicLocation: {
      city: request.publicLocation?.city ?? null,
      province: request.publicLocation?.province ?? null,
    },
    owner: serializePublicPerson(request.ownerId),
    needItem: serializeNeedSummary(request, needItemId),
  };
}

export function serializeOffer(offer) {
  const requestId = idOf(offer.requestId);
  const helperId = idOf(offer.helperId);
  return {
    id: idOf(offer),
    requestId,
    helperId,
    helpType: offer.helpType,
    assistanceMode:
      offer.helpType === "money" ? "MONETARY_PLEDGE" : "DIRECT_ASSISTANCE",
    needItemId: idOf(offer.needItemId),
    message: offer.message,
    quantity: offer.quantity ?? null,
    pledgedValueCentavos: offer.pledgedValueCentavos ?? null,
    estimatedMinutes: offer.estimatedMinutes ?? null,
    status: offer.status,
    acceptedAt: timestamp(offer.acceptedAt),
    startedAt: timestamp(offer.startedAt),
    completionSubmittedAt: timestamp(offer.completionSubmittedAt),
    completedAt: timestamp(offer.completedAt),
    createdAt: timestamp(offer.createdAt),
    updatedAt: timestamp(offer.updatedAt),
    helper: serializePublicPerson(offer.helperId),
    request: serializeRequestSummary(offer.requestId, offer.needItemId),
  };
}
