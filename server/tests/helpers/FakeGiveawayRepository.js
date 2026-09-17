import { randomBytes } from "node:crypto";

import {
  requestHasConfirmedProgress,
  requestIsFullySolved,
} from "../../src/utils/requestProgress.js";

function objectId() {
  return randomBytes(12).toString("hex");
}

function person(user) {
  return user
    ? {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        verification: user.verification,
        accountStatus: user.accountStatus,
      }
    : null;
}

function afterCursor(row, cursor, field, direction) {
  if (!cursor) return true;
  const value = new Date(row[field]).getTime();
  const cursorValue = cursor.date.getTime();
  return direction === 1
    ? value > cursorValue || (value === cursorValue && row._id > cursor.id)
    : value < cursorValue || (value === cursorValue && row._id < cursor.id);
}

function sortRows(left, right, field, direction) {
  const difference =
    (new Date(left[field]).getTime() - new Date(right[field]).getTime()) *
    direction;
  return difference || left._id.localeCompare(right._id) * direction;
}

function page(rows, limit) {
  return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
}

function notification(recipientId, resourceId, kind) {
  return {
    _id: objectId(),
    recipientId: String(recipientId),
    resourceId,
    kind,
  };
}

export class FakeGiveawayRepository {
  constructor(userRepository, requestRepository) {
    this.userRepository = userRepository;
    this.requestRepository = requestRepository;
    this.items = new Map();
    this.reservationRecords = new Map();
    this.idempotency = new Map();
  }

  idempotencyId({ principalId, operation, keyHash }) {
    return `${principalId}:${operation}:${keyHash}`;
  }

  async claimIdempotency(input) {
    const id = this.idempotencyId(input);
    const existing = this.idempotency.get(id);
    if (!existing || existing.expiresAt <= input.now) {
      this.idempotency.set(id, { ...input, state: "in_progress" });
      return { outcome: "claimed" };
    }
    if (existing.requestHash !== input.requestHash)
      return { outcome: "mismatch" };
    if (existing.state === "completed")
      return { outcome: "replay", responseBody: existing.responseBody };
    return { outcome: "in_progress" };
  }

  async completeIdempotency(input) {
    const id = this.idempotencyId(input);
    const record = this.idempotency.get(id);
    if (!record || record.requestHash !== input.requestHash) return null;
    Object.assign(record, {
      state: "completed",
      responseBody: input.responseBody,
      responseStatus: input.responseStatus,
    });
    return { _id: id };
  }

  async releaseIdempotency(input) {
    const id = this.idempotencyId(input);
    if (this.idempotency.get(id)?.state === "in_progress")
      this.idempotency.delete(id);
  }

  hydrateItem(item, owner = true) {
    return {
      ...item,
      ownerId: owner
        ? person(this.userRepository.users.get(String(item.ownerId)))
        : item.ownerId,
    };
  }

  hydrateReservation(record) {
    if (!record) return null;
    const item = this.items.get(String(record.itemId));
    const request = this.requestRepository.requests.get(
      String(record.requestId),
    );
    return {
      ...record,
      itemId: item ? { ...item } : record.itemId,
      requestId: request ? { ...request } : record.requestId,
      donorId: person(this.userRepository.users.get(String(record.donorId))),
      recipientId: person(
        this.userRepository.users.get(String(record.recipientId)),
      ),
    };
  }

  async createItem(ownerId, input, now) {
    const item = {
      _id: objectId(),
      ownerId: String(ownerId),
      ...input,
      publicLocation: {
        city: input.location.city,
        province: input.location.province,
      },
      photos: [],
      reservedQuantity: 0,
      givenQuantity: 0,
      status: "available",
      givenAt: null,
      removedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(item._id, item);
    return item;
  }

  async findOwnedItem(itemId, ownerId) {
    const item = this.items.get(String(itemId));
    return item?.ownerId === String(ownerId) ? item : null;
  }

  async findPublicItem(itemId) {
    const item = this.items.get(String(itemId));
    if (
      !item ||
      item.status !== "available" ||
      item.quantity <= item.reservedQuantity + item.givenQuantity
    )
      return null;
    const owner = this.userRepository.users.get(String(item.ownerId));
    return owner?.accountStatus === "active"
      ? this.hydrateItem(item, true)
      : null;
  }

  async listPublic({ limit, cursor, category, condition, province, city }) {
    const rows = [...this.items.values()]
      .filter((item) => {
        const owner = this.userRepository.users.get(String(item.ownerId));
        return (
          item.status === "available" &&
          item.quantity > item.reservedQuantity + item.givenQuantity &&
          owner?.accountStatus === "active" &&
          (!category || item.category === category) &&
          (!condition || item.condition === condition) &&
          (!province ||
            item.publicLocation.province.toLocaleLowerCase("en") ===
              province.toLocaleLowerCase("en")) &&
          (!city ||
            item.publicLocation.city.toLocaleLowerCase("en") ===
              city.toLocaleLowerCase("en")) &&
          afterCursor(item, cursor, "createdAt", -1)
        );
      })
      .sort((left, right) => sortRows(left, right, "createdAt", -1))
      .map((item) => this.hydrateItem(item, true));
    return page(rows, limit);
  }

  async listOwned({ ownerId, status, limit, cursor }) {
    const rows = [...this.items.values()]
      .filter(
        (item) =>
          item.ownerId === String(ownerId) &&
          (!status || item.status === status) &&
          afterCursor(item, cursor, "createdAt", -1),
      )
      .sort((left, right) => sortRows(left, right, "createdAt", -1));
    return page(rows, limit);
  }

  async listMatches({ itemId, ownerId, limit, cursor }) {
    const item = await this.findOwnedItem(itemId, ownerId);
    if (!item || item.status === "removed") return null;
    const rows = [...this.requestRepository.requests.values()]
      .filter((request) => {
        const owner = this.userRepository.users.get(String(request.ownerId));
        return (
          request.ownerId !== String(ownerId) &&
          ["published", "partially_solved"].includes(request.status) &&
          request.visibility === "public" &&
          request.category === item.category &&
          owner?.accountStatus === "active" &&
          request.needItems.some(
            (need) =>
              need.type === "item" &&
              need.quantity >
                (need.solvedQuantity ?? 0) + (need.reservedQuantity ?? 0),
          ) &&
          afterCursor(request, cursor, "publishedAt", 1)
        );
      })
      .sort((left, right) => sortRows(left, right, "publishedAt", 1))
      .map((request) => this.requestRepository.populate(request, true));
    return page(rows, limit);
  }

  blocked(leftId, rightId) {
    return Boolean(
      [...(this.userRepository.blocks?.values?.() ?? [])].some(
        (block) =>
          (String(block.blockerId) === String(leftId) &&
            String(block.blockedId) === String(rightId)) ||
          (String(block.blockerId) === String(rightId) &&
            String(block.blockedId) === String(leftId)),
      ),
    );
  }

  async reserveAtomically({
    itemId,
    recipientId,
    requestId,
    needItemId,
    quantity,
    now,
  }) {
    const item = this.items.get(String(itemId));
    const request = this.requestRepository.requests.get(String(requestId));
    if (
      !item ||
      item.ownerId === String(recipientId) ||
      !["available", "reserved"].includes(item.status) ||
      !request ||
      request.ownerId !== String(recipientId) ||
      !["published", "partially_solved"].includes(request.status)
    )
      return { outcome: "not_found", reservation: null };
    const donor = this.userRepository.users.get(String(item.ownerId));
    const recipient = this.userRepository.users.get(String(recipientId));
    if (
      donor?.accountStatus !== "active" ||
      recipient?.accountStatus !== "active" ||
      this.blocked(item.ownerId, recipientId)
    )
      return { outcome: "unavailable", reservation: null };
    const need = request.needItems.find(
      (candidate) => String(candidate._id) === String(needItemId),
    );
    if (!need || need.type !== "item")
      return { outcome: "need_mismatch", reservation: null };
    const activeKey = `${itemId}:${recipientId}:${requestId}:${needItemId}`;
    if (
      [...this.reservationRecords.values()].some(
        (record) => record.activeKey === activeKey,
      )
    )
      return { outcome: "duplicate", reservation: null };
    const itemRemaining =
      item.quantity - item.reservedQuantity - item.givenQuantity;
    const needRemaining =
      need.quantity - (need.reservedQuantity ?? 0) - (need.solvedQuantity ?? 0);
    if (quantity > itemRemaining || quantity > needRemaining)
      return { outcome: "insufficient", reservation: null };

    item.reservedQuantity += quantity;
    item.status =
      item.reservedQuantity + item.givenQuantity >= item.quantity
        ? "reserved"
        : "available";
    item.updatedAt = now;
    need.reservedQuantity = (need.reservedQuantity ?? 0) + quantity;
    request.updatedAt = now;
    const record = {
      _id: objectId(),
      itemId: item._id,
      donorId: item.ownerId,
      recipientId: String(recipientId),
      requestId: request._id,
      needItemId: String(needItemId),
      quantity,
      status: "reserved",
      activeKey,
      donorConfirmedAt: null,
      recipientConfirmedAt: null,
      completedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      createdAt: now,
      updatedAt: now,
    };
    this.reservationRecords.set(record._id, record);
    return {
      outcome: "reserved",
      reservation: this.hydrateReservation(record),
      notification: notification(item.ownerId, record._id, "giveaway_reserved"),
    };
  }

  async findReservation(reservationId) {
    return this.hydrateReservation(
      this.reservationRecords.get(String(reservationId)),
    );
  }

  async listReservations({ participantId, status, limit, cursor }) {
    const rows = [...this.reservationRecords.values()]
      .filter(
        (record) =>
          [record.donorId, record.recipientId].includes(
            String(participantId),
          ) &&
          (!status || record.status === status) &&
          afterCursor(record, cursor, "createdAt", -1),
      )
      .sort((left, right) => sortRows(left, right, "createdAt", -1))
      .map((record) => this.hydrateReservation(record));
    return page(rows, limit);
  }

  async confirmAtomically({ reservationId, actorId, now }) {
    const record = this.reservationRecords.get(String(reservationId));
    if (
      !record ||
      ![record.donorId, record.recipientId].includes(String(actorId))
    )
      return { outcome: "not_found", reservation: null };
    if (record.status === "completed")
      return {
        outcome: "completed",
        reservation: this.hydrateReservation(record),
      };
    if (record.status !== "reserved")
      return {
        outcome: "resolved",
        reservation: this.hydrateReservation(record),
      };
    const donor = this.userRepository.users.get(String(record.donorId));
    const recipient = this.userRepository.users.get(String(record.recipientId));
    if (
      donor?.accountStatus !== "active" ||
      recipient?.accountStatus !== "active" ||
      this.blocked(record.donorId, record.recipientId)
    )
      return {
        outcome: "unavailable",
        reservation: this.hydrateReservation(record),
      };

    const donorActing = String(record.donorId) === String(actorId);
    const ownField = donorActing ? "donorConfirmedAt" : "recipientConfirmedAt";
    const otherField = donorActing
      ? "recipientConfirmedAt"
      : "donorConfirmedAt";
    if (record[ownField])
      return {
        outcome: "confirmed",
        reservation: this.hydrateReservation(record),
      };
    record[ownField] = now;
    record.updatedAt = now;
    const completes = Boolean(record[otherField]);
    if (completes) {
      const item = this.items.get(record.itemId);
      const request = this.requestRepository.requests.get(record.requestId);
      const need = request?.needItems.find(
        (candidate) => String(candidate._id) === String(record.needItemId),
      );
      if (
        !item ||
        !need ||
        item.reservedQuantity < record.quantity ||
        (need.reservedQuantity ?? 0) < record.quantity
      )
        return {
          outcome: "state_changed",
          reservation: this.hydrateReservation(record),
        };
      item.reservedQuantity -= record.quantity;
      item.givenQuantity += record.quantity;
      item.status =
        item.givenQuantity >= item.quantity
          ? "given"
          : item.reservedQuantity + item.givenQuantity >= item.quantity
            ? "reserved"
            : "available";
      item.givenAt = item.status === "given" ? now : item.givenAt;
      item.updatedAt = now;
      need.reservedQuantity -= record.quantity;
      need.solvedQuantity = (need.solvedQuantity ?? 0) + record.quantity;
      request.status = requestIsFullySolved(request.needItems)
        ? "solved"
        : requestHasConfirmedProgress(request.needItems)
          ? "partially_solved"
          : "published";
      request.solvedAt = request.status === "solved" ? now : null;
      request.updatedAt = now;
      record.status = "completed";
      record.completedAt = now;
      delete record.activeKey;
    }
    const otherId = donorActing ? record.recipientId : record.donorId;
    return {
      outcome: completes ? "completed" : "confirmed",
      reservation: this.hydrateReservation(record),
      notification: notification(
        otherId,
        record._id,
        completes
          ? "giveaway_handoff_completed"
          : "giveaway_confirmation_needed",
      ),
    };
  }

  async cancelAtomically({ reservationId, actorId, now }) {
    const record = this.reservationRecords.get(String(reservationId));
    if (
      !record ||
      ![record.donorId, record.recipientId].includes(String(actorId))
    )
      return { outcome: "not_found", reservation: null };
    if (record.status !== "reserved")
      return {
        outcome: "resolved",
        reservation: this.hydrateReservation(record),
      };
    if (record.donorConfirmedAt || record.recipientConfirmedAt)
      return {
        outcome: "confirmation_started",
        reservation: this.hydrateReservation(record),
      };
    const item = this.items.get(record.itemId);
    const request = this.requestRepository.requests.get(record.requestId);
    const need = request?.needItems.find(
      (candidate) => String(candidate._id) === String(record.needItemId),
    );
    if (!item || !need) return { outcome: "state_changed", reservation: null };
    item.reservedQuantity -= record.quantity;
    item.status =
      item.reservedQuantity + item.givenQuantity >= item.quantity
        ? "reserved"
        : "available";
    item.updatedAt = now;
    need.reservedQuantity -= record.quantity;
    request.updatedAt = now;
    record.status = "cancelled";
    record.cancelledAt = now;
    record.cancelledBy = String(actorId);
    record.updatedAt = now;
    delete record.activeKey;
    const otherId =
      String(actorId) === record.donorId ? record.recipientId : record.donorId;
    return {
      outcome: "cancelled",
      reservation: this.hydrateReservation(record),
      notification: notification(
        otherId,
        record._id,
        "giveaway_reservation_cancelled",
      ),
    };
  }

  async removeOwned(itemId, ownerId, now) {
    const item = await this.findOwnedItem(itemId, ownerId);
    if (!item || item.status !== "available" || item.reservedQuantity !== 0)
      return null;
    item.status = "removed";
    item.removedAt = now;
    item.updatedAt = now;
    return item;
  }
}
