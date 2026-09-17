import { createHash } from "node:crypto";

import {
  serializeGiveawayMatch,
  serializeGiveawayReservation,
  serializeOwnedGiveawayItem,
  serializePublicGiveawayItem,
} from "../serializers/giveaway.serializer.js";
import { AppError } from "../utils/AppError.js";
import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";
import { assessRequestSafety } from "../utils/requestSafety.js";

function giveawayError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function buildPage({ page, scope, dateField, serializer }) {
  const last = page.items.at(-1);
  return {
    items: page.items.map(serializer).filter(Boolean),
    pageInfo: {
      hasNextPage: page.hasNextPage,
      nextCursor:
        page.hasNextPage && last
          ? encodePageCursor({
              scope,
              date: last[dateField],
              id: idOf(last),
            })
          : null,
    },
  };
}

function transitionError(outcome) {
  const errors = {
    not_found: [404, "GIVEAWAY_NOT_FOUND", "Giveaway handoff not found"],
    unavailable: [
      409,
      "GIVEAWAY_UNAVAILABLE",
      "This giveaway is no longer available for that operation",
    ],
    need_mismatch: [
      422,
      "GIVEAWAY_NEED_MISMATCH",
      "A giveaway must be reserved against an item need you own",
    ],
    insufficient: [
      409,
      "GIVEAWAY_QUANTITY_UNAVAILABLE",
      "The giveaway or request no longer has enough unreserved quantity",
    ],
    duplicate: [
      409,
      "GIVEAWAY_ALREADY_RESERVED",
      "You already have an active reservation for this item and need",
    ],
    confirmation_started: [
      409,
      "GIVEAWAY_CONFIRMATION_STARTED",
      "A confirmed handoff cannot be cancelled by a participant",
    ],
    resolved: [
      409,
      "GIVEAWAY_ALREADY_RESOLVED",
      "This handoff is already completed or cancelled",
    ],
    state_changed: [
      409,
      "GIVEAWAY_STATE_CHANGED",
      "Giveaway state changed; reload and try again",
    ],
  };
  const [status, code, message] = errors[outcome] ?? errors.state_changed;
  return giveawayError(status, code, message);
}

export class GiveawayService {
  constructor({ repository, config, publisher, clock = () => new Date() }) {
    this.repository = repository;
    this.config = config;
    this.publisher = publisher;
    this.clock = clock;
  }

  publish(notification) {
    if (notification)
      this.publisher?.publishNotification?.({
        recipientId: notification.recipientId,
        notificationId: notification._id,
      });
  }

  digest(value) {
    return createHash("sha256").update(value).digest("hex");
  }

  async runIdempotent({ principalId, operation, key, payload }, work) {
    const now = this.clock();
    const identity = {
      principalId,
      operation,
      keyHash: this.digest(key),
      requestHash: this.digest(JSON.stringify(payload)),
    };
    const claim = await this.repository.claimIdempotency({
      ...identity,
      now,
      expiresAt: new Date(
        now.getTime() + this.config.idempotencyTtlHours * 60 * 60 * 1000,
      ),
    });
    if (claim.outcome === "mismatch")
      throw giveawayError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used for a different payload",
      );
    if (claim.outcome === "in_progress")
      throw giveawayError(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        "An operation with this idempotency key is still in progress",
      );
    if (claim.outcome === "replay") return claim.responseBody;
    try {
      const responseBody = await work();
      const completed = await this.repository.completeIdempotency({
        ...identity,
        responseStatus: 200,
        responseBody,
        now: this.clock(),
      });
      if (!completed) throw new Error("Idempotency record changed");
      return responseBody;
    } catch (error) {
      await this.repository.releaseIdempotency(identity);
      throw error;
    }
  }

  async create(ownerId, input, idempotencyKey) {
    const safetyFlags = assessRequestSafety({
      title: input.title,
      description: input.description,
      helpTypes: ["item"],
      needItems: [
        { name: input.title, description: input.description, type: "item" },
      ],
    });
    if (safetyFlags.length)
      throw giveawayError(
        422,
        "GIVEAWAY_CONTENT_NOT_ALLOWED",
        "This item cannot be listed through the free-item workflow",
      );
    return this.runIdempotent(
      {
        principalId: ownerId,
        operation: "giveaway.create",
        key: idempotencyKey,
        payload: input,
      },
      async () => {
        const item = await this.repository.createItem(
          ownerId,
          {
            ...input,
            location: {
              country: input.location.country ?? "Philippines",
              province: input.location.province,
              city: input.location.city,
              barangay: input.location.barangay ?? null,
            },
          },
          this.clock(),
        );
        return { item: serializeOwnedGiveawayItem(item) };
      },
    );
  }

  async get(itemId, viewerId) {
    if (viewerId) {
      const owned = await this.repository.findOwnedItem(itemId, viewerId);
      if (owned) return { item: serializeOwnedGiveawayItem(owned) };
    }
    const item = await this.repository.findPublicItem(itemId);
    const serialized = serializePublicGiveawayItem(item);
    if (!serialized)
      throw giveawayError(404, "GIVEAWAY_NOT_FOUND", "Giveaway item not found");
    return { item: serialized };
  }

  async listPublic(query) {
    const scope = `giveaways:${query.category ?? ""}:${query.condition ?? ""}:${query.province?.toLocaleLowerCase("en") ?? ""}:${query.city?.toLocaleLowerCase("en") ?? ""}`;
    const page = await this.repository.listPublic({
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return buildPage({
      page,
      scope,
      dateField: "createdAt",
      serializer: serializePublicGiveawayItem,
    });
  }

  async listMine(ownerId, query) {
    const scope = `giveaways-owner:${ownerId}:${query.status ?? ""}`;
    const page = await this.repository.listOwned({
      ownerId,
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return buildPage({
      page,
      scope,
      dateField: "createdAt",
      serializer: serializeOwnedGiveawayItem,
    });
  }

  async matches(ownerId, itemId, query) {
    const scope = `giveaway-matches:${ownerId}:${itemId}`;
    const page = await this.repository.listMatches({
      itemId,
      ownerId,
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    if (!page)
      throw giveawayError(404, "GIVEAWAY_NOT_FOUND", "Giveaway item not found");
    return buildPage({
      page,
      scope,
      dateField: "publishedAt",
      serializer: serializeGiveawayMatch,
    });
  }

  reserve(recipientId, itemId, input, idempotencyKey) {
    return this.runIdempotent(
      {
        principalId: recipientId,
        operation: "giveaway.reserve",
        key: idempotencyKey,
        payload: { itemId, ...input },
      },
      async () => {
        const result = await this.repository.reserveAtomically({
          itemId,
          recipientId,
          ...input,
          now: this.clock(),
        });
        if (result.outcome !== "reserved")
          throw transitionError(result.outcome);
        this.publish(result.notification);
        return {
          reservation: serializeGiveawayReservation(result.reservation),
        };
      },
    );
  }

  async reservations(participantId, query) {
    const scope = `giveaway-reservations:${participantId}:${query.status ?? ""}`;
    const page = await this.repository.listReservations({
      participantId,
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return buildPage({
      page,
      scope,
      dateField: "createdAt",
      serializer: serializeGiveawayReservation,
    });
  }

  confirm(actorId, reservationId, idempotencyKey) {
    return this.runIdempotent(
      {
        principalId: actorId,
        operation: "giveaway.confirm",
        key: idempotencyKey,
        payload: { reservationId },
      },
      async () => {
        const result = await this.repository.confirmAtomically({
          reservationId,
          actorId,
          now: this.clock(),
        });
        if (!["confirmed", "completed"].includes(result.outcome))
          throw transitionError(result.outcome);
        this.publish(result.notification);
        return {
          reservation: serializeGiveawayReservation(result.reservation),
        };
      },
    );
  }

  async cancel(actorId, reservationId) {
    const result = await this.repository.cancelAtomically({
      reservationId,
      actorId,
      now: this.clock(),
    });
    if (result.outcome !== "cancelled") throw transitionError(result.outcome);
    this.publish(result.notification);
    return { reservation: serializeGiveawayReservation(result.reservation) };
  }

  async remove(ownerId, itemId) {
    const item = await this.repository.removeOwned(
      itemId,
      ownerId,
      this.clock(),
    );
    if (!item)
      throw giveawayError(
        409,
        "GIVEAWAY_NOT_REMOVABLE",
        "Only an available item without active reservations can be removed",
      );
    return { item: serializeOwnedGiveawayItem(item) };
  }
}
