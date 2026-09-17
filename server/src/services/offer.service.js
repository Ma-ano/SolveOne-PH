import { createHash } from "node:crypto";

import { serializeOffer } from "../serializers/offer.serializer.js";
import { serializeEvidence } from "../serializers/evidence.serializer.js";
import { hashIpAddress } from "../utils/authCrypto.js";
import { AppError } from "../utils/AppError.js";
import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";

function offerError(statusCode, code, message, details) {
  return new AppError({ statusCode, code, message, details });
}

function notFound() {
  return offerError(404, "OFFER_NOT_FOUND", "Offer not found");
}

function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function findNeedItem(request, needItemId) {
  return request.needItems?.find((item) => idOf(item) === String(needItemId));
}

function remainingFor(item, helpType) {
  if (helpType === "money") {
    return (
      (item.estimatedValueCentavos ?? 0) -
      (item.solvedValueCentavos ?? 0) -
      (item.reservedValueCentavos ?? 0)
    );
  }
  return (
    (item.quantity ?? 0) -
    (item.solvedQuantity ?? 0) -
    (item.reservedQuantity ?? 0)
  );
}

function offeredAmount(input) {
  return input.helpType === "money"
    ? input.pledgedValueCentavos
    : input.quantity;
}

function normalizeOfferInput(input) {
  return {
    needItemId: input.needItemId,
    helpType: input.helpType,
    message: input.message,
    quantity: input.helpType === "money" ? null : input.quantity,
    pledgedValueCentavos:
      input.helpType === "money" ? input.pledgedValueCentavos : null,
    estimatedMinutes: ["skill", "time"].includes(input.helpType)
      ? input.estimatedMinutes
      : null,
  };
}

function transitionFailure(outcome) {
  if (outcome === "not_found") {
    return notFound();
  }
  if (outcome === "insufficient") {
    return offerError(
      409,
      "INSUFFICIENT_REMAINING_NEED",
      "This need no longer has enough unreserved capacity for the offer",
    );
  }
  if (outcome === "request_unavailable") {
    return offerError(
      409,
      "REQUEST_NOT_AVAILABLE",
      "This request is no longer available for that operation",
    );
  }
  if (outcome === "evidence_invalid") {
    return offerError(
      422,
      "EVIDENCE_FILE_INVALID",
      "Evidence files must be recently uploaded for this offer by its helper",
    );
  }
  if (outcome === "duration_not_applicable") {
    return offerError(
      422,
      "EVIDENCE_DURATION_NOT_APPLICABLE",
      "Actual volunteer minutes apply only to skill or time assistance",
    );
  }
  return offerError(
    409,
    "OFFER_ALREADY_RESOLVED",
    "Offer state changed; reload to see its current status",
  );
}

function buildPage(page, scope) {
  const lastItem = page.items.at(-1);
  return {
    items: page.items.map(serializeOffer),
    pageInfo: {
      hasNextPage: page.hasNextPage,
      nextCursor:
        page.hasNextPage && lastItem
          ? encodePageCursor({
              scope,
              date: lastItem.createdAt,
              id: idOf(lastItem),
            })
          : null,
    },
  };
}

export class OfferService {
  constructor({ repository, config, publisher, clock = () => new Date() }) {
    this.repository = repository;
    this.config = config;
    this.publisher = publisher;
    this.clock = clock;
  }

  publishNotification(notification) {
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
    const keyHash = this.digest(key);
    const requestHash = this.digest(JSON.stringify(payload));
    const identity = {
      principalId,
      operation,
      keyHash,
      requestHash,
    };
    const claim = await this.repository.claimIdempotency({
      ...identity,
      now,
      expiresAt: new Date(
        now.getTime() + this.config.idempotencyTtlHours * 60 * 60 * 1000,
      ),
    });
    if (claim.outcome === "mismatch") {
      throw offerError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used for a different operation payload",
      );
    }
    if (claim.outcome === "in_progress") {
      throw offerError(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        "An operation with this idempotency key is still in progress",
      );
    }
    if (claim.outcome === "replay") {
      return claim.responseBody;
    }

    try {
      const responseBody = await work();
      const completed = await this.repository.completeIdempotency({
        ...identity,
        responseStatus: 200,
        responseBody,
        now: this.clock(),
      });
      if (!completed) {
        throw new Error("Idempotency record changed before completion");
      }
      return responseBody;
    } catch (error) {
      await this.repository.releaseIdempotency(identity);
      throw error;
    }
  }

  async create(helperId, requestId, input) {
    const request = await this.repository.findOpenRequest(requestId);
    if (!request || !request.ownerId) {
      throw offerError(404, "REQUEST_NOT_FOUND", "Request not found");
    }
    const ownerId = idOf(request.ownerId);
    if (ownerId === String(helperId)) {
      throw offerError(
        422,
        "SELF_OFFER_NOT_ALLOWED",
        "Request owners cannot offer help to their own request",
      );
    }
    if (await this.repository.isBlocked(helperId, ownerId)) {
      throw offerError(
        409,
        "REQUEST_NOT_AVAILABLE",
        "This request is no longer available for an offer",
      );
    }

    const needItem = findNeedItem(request, input.needItemId);
    if (!needItem || needItem.type !== input.helpType) {
      throw offerError(
        422,
        "OFFER_NEED_MISMATCH",
        "The selected help type must match the request need item",
      );
    }
    const remaining = remainingFor(needItem, input.helpType);
    if (remaining <= 0) {
      throw offerError(
        409,
        "INSUFFICIENT_REMAINING_NEED",
        "This need is already fully solved or reserved",
      );
    }
    if (offeredAmount(input) > remaining) {
      throw offerError(
        409,
        "INSUFFICIENT_REMAINING_NEED",
        "Offer amount exceeds the need item's currently unreserved capacity",
      );
    }

    const duplicate = await this.repository.findActiveOffer(
      requestId,
      helperId,
      input.needItemId,
    );
    if (duplicate) {
      throw offerError(
        409,
        "OFFER_ALREADY_ACTIVE",
        "You already have an active offer for this need item",
      );
    }

    let created;
    try {
      created = await this.repository.create(
        {
          requestId,
          helperId,
          ...normalizeOfferInput(input),
        },
        this.clock(),
      );
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.activeKey) {
        throw offerError(
          409,
          "OFFER_ALREADY_ACTIVE",
          "You already have an active offer for this need item",
        );
      }
      throw error;
    }
    if (!created) {
      throw offerError(
        409,
        "REQUEST_NOT_AVAILABLE",
        "This request is no longer available for an offer",
      );
    }

    const offer = await this.repository.findHydratedById(created._id);
    this.publishNotification(created.notification);
    return { offer: serializeOffer(offer) };
  }

  async accept(ownerId, offerId, idempotencyKey) {
    return this.runIdempotent(
      {
        principalId: ownerId,
        operation: "offer.accept",
        key: idempotencyKey,
        payload: { offerId: String(offerId) },
      },
      async () => {
        const result = await this.repository.acceptAtomically({
          offerId,
          ownerId,
          now: this.clock(),
        });
        if (result.outcome !== "accepted") {
          throw transitionFailure(result.outcome);
        }
        this.publishNotification(result.notification);
        return { offer: serializeOffer(result.offer) };
      },
    );
  }

  async reject(ownerId, offerId) {
    const result = await this.repository.reject({
      offerId,
      ownerId,
      now: this.clock(),
    });
    if (result.outcome !== "rejected") {
      throw transitionFailure(result.outcome);
    }
    this.publishNotification(result.notification);
    return { offer: serializeOffer(result.offer) };
  }

  async withdraw(helperId, offerId) {
    const result = await this.repository.withdraw({
      offerId,
      helperId,
      now: this.clock(),
    });
    if (result.outcome !== "withdrawn") {
      throw transitionFailure(result.outcome);
    }
    return { offer: serializeOffer(result.offer) };
  }

  async start(helperId, offerId) {
    const result = await this.repository.start({
      offerId,
      helperId,
      now: this.clock(),
    });
    if (result.outcome !== "started") {
      throw transitionFailure(result.outcome);
    }
    return { offer: serializeOffer(result.offer) };
  }

  async complete(helperId, offerId, input) {
    const result = await this.repository.submitCompletion({
      offerId,
      helperId,
      note: input.note,
      actualMinutes: input.actualMinutes ?? null,
      fileIds: input.fileIds ?? [],
      now: this.clock(),
    });
    if (result.outcome !== "submitted") throw transitionFailure(result.outcome);
    this.publishNotification(result.notification);
    return {
      offer: serializeOffer(result.offer),
      evidence: serializeEvidence(result.evidence),
    };
  }

  async confirm(ownerId, offerId, idempotencyKey) {
    return this.runIdempotent(
      {
        principalId: ownerId,
        operation: "offer.confirm",
        key: idempotencyKey,
        payload: { offerId: String(offerId) },
      },
      async () => {
        const result = await this.repository.confirmCompletion({
          offerId,
          ownerId,
          now: this.clock(),
        });
        if (result.outcome !== "completed")
          throw transitionFailure(result.outcome);
        this.publishNotification(result.notification);
        return {
          offer: serializeOffer(result.offer),
          evidence: serializeEvidence(result.evidence),
        };
      },
    );
  }

  async dispute(ownerId, offerId, input) {
    const result = await this.repository.disputeCompletion({
      offerId,
      ownerId,
      reason: input.reason,
      now: this.clock(),
    });
    if (result.outcome !== "disputed") throw transitionFailure(result.outcome);
    this.publishNotification(result.notification);
    return {
      offer: serializeOffer(result.offer),
      evidence: serializeEvidence(result.evidence),
    };
  }

  async evidence(participantId, offerId) {
    const evidence = await this.repository.findEvidenceForParticipant(
      offerId,
      participantId,
    );
    if (!evidence) throw notFound();
    return { evidence: serializeEvidence(evidence) };
  }

  async uploadEvidenceFile(helperId, offerId, input) {
    const file = await this.repository.uploadEvidenceFile({
      offerId,
      helperId,
      ...input,
      now: this.clock(),
    });
    if (!file) throw notFound();
    return { file };
  }

  async evidenceFile(participantId, offerId, fileId, { ipAddress } = {}) {
    const file = await this.repository.readEvidenceFile({
      offerId,
      fileId,
      participantId,
    });
    if (!file) throw notFound();
    await this.repository.recordEvidenceAccess({
      offerId,
      fileId,
      participantId,
      ipHash: hashIpAddress(ipAddress, this.config.ipHashSecret),
      now: this.clock(),
    });
    return file;
  }

  async listMine(helperId, query) {
    const scope = `helper:${helperId}:${query.status ?? ""}`;
    const cursor = decodePageCursor(query.cursor, scope);
    const page = await this.repository.listForHelper({
      helperId,
      ...query,
      cursor,
    });
    return buildPage(page, scope);
  }

  async listForRequest(ownerId, requestId, query) {
    const scope = `request-offers:${requestId}:${query.status ?? ""}`;
    const cursor = decodePageCursor(query.cursor, scope);
    const page = await this.repository.listForRequestOwner({
      requestId,
      ownerId,
      ...query,
      cursor,
    });
    if (!page) {
      throw offerError(404, "REQUEST_NOT_FOUND", "Request not found");
    }
    return buildPage(page, scope);
  }
}
