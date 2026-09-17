import { serializePublicRequest } from "./request.serializer.js";

function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function serializePerson(user) {
  if (!user || typeof user !== "object") return null;
  const initial = user.lastName?.trim().charAt(0);
  return {
    id: idOf(user),
    displayName: initial
      ? `${user.firstName} ${initial.toLocaleUpperCase("en")}.`
      : user.firstName,
    verificationLevel: user.verification?.level ?? "UNVERIFIED",
  };
}

function serializeBase(item) {
  const reservedQuantity = item.reservedQuantity ?? 0;
  const givenQuantity = item.givenQuantity ?? 0;
  return {
    id: idOf(item),
    title: item.title,
    description: item.description,
    category: item.category,
    condition: item.condition,
    quantity: item.quantity,
    reservedQuantity,
    givenQuantity,
    availableQuantity: Math.max(
      0,
      item.quantity - reservedQuantity - givenQuantity,
    ),
    status: item.status,
    givenAt: timestamp(item.givenAt),
    removedAt: timestamp(item.removedAt),
    createdAt: timestamp(item.createdAt),
    updatedAt: timestamp(item.updatedAt),
  };
}

export function serializePublicGiveawayItem(item) {
  const owner = serializePerson(item?.ownerId);
  if (!item || !owner) return null;
  return {
    ...serializeBase(item),
    owner,
    publicLocation: {
      city: item.publicLocation?.city ?? null,
      province: item.publicLocation?.province ?? null,
    },
  };
}

export function serializeOwnedGiveawayItem(item) {
  if (!item) return null;
  return {
    ...serializeBase(item),
    ownerId: idOf(item.ownerId),
    publicLocation: {
      city: item.publicLocation?.city ?? null,
      province: item.publicLocation?.province ?? null,
    },
    location: {
      country: item.location?.country ?? null,
      province: item.location?.province ?? null,
      city: item.location?.city ?? null,
      barangay: item.location?.barangay ?? null,
    },
  };
}

export function serializeGiveawayMatch(request) {
  const serialized = serializePublicRequest(request);
  if (!serialized) return null;
  return {
    ...serialized,
    giveawayMatch: {
      needItems: (request.needItems ?? [])
        .filter(
          (item) =>
            item.type === "item" &&
            (item.quantity ?? 0) -
              (item.solvedQuantity ?? 0) -
              (item.reservedQuantity ?? 0) >
              0,
        )
        .map((item) => ({
          id: idOf(item),
          name: item.name,
          remainingQuantity: Math.max(
            0,
            item.quantity -
              (item.solvedQuantity ?? 0) -
              (item.reservedQuantity ?? 0),
          ),
        })),
      reasons: [
        "Same item category",
        ...(request.giveawayNearbyRank === 2
          ? ["Same city"]
          : request.giveawayNearbyRank === 1
            ? ["Same province"]
            : []),
      ],
    },
  };
}

export function serializeGiveawayReservation(reservation) {
  if (!reservation) return null;
  const item = reservation.itemId;
  const request = reservation.requestId;
  const need = request?.needItems?.find(
    (candidate) => idOf(candidate) === idOf(reservation.needItemId),
  );
  return {
    id: idOf(reservation),
    itemId: idOf(item),
    requestId: idOf(request),
    needItemId: idOf(reservation.needItemId),
    donorId: idOf(reservation.donorId),
    recipientId: idOf(reservation.recipientId),
    quantity: reservation.quantity,
    status: reservation.status,
    donorConfirmedAt: timestamp(reservation.donorConfirmedAt),
    recipientConfirmedAt: timestamp(reservation.recipientConfirmedAt),
    completedAt: timestamp(reservation.completedAt),
    cancelledAt: timestamp(reservation.cancelledAt),
    createdAt: timestamp(reservation.createdAt),
    updatedAt: timestamp(reservation.updatedAt),
    donor: serializePerson(reservation.donorId),
    recipient: serializePerson(reservation.recipientId),
    item: item && typeof item === "object" ? serializeBase(item) : null,
    request:
      request && typeof request === "object"
        ? {
            id: idOf(request),
            title: request.title,
            status: request.status,
            publicLocation: {
              city: request.publicLocation?.city ?? null,
              province: request.publicLocation?.province ?? null,
            },
            needItem: need
              ? { id: idOf(need), name: need.name, type: need.type }
              : null,
          }
        : null,
  };
}
