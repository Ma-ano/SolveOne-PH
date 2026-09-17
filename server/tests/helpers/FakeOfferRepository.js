import { randomBytes } from "node:crypto";
import {
  requestHasConfirmedProgress,
  requestIsFullySolved,
} from "../../src/utils/requestProgress.js";
import { validateEvidenceFile } from "../../src/utils/evidenceFiles.js";

function objectId() {
  return randomBytes(12).toString("hex");
}

function publicPerson(user) {
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

function afterCursor(row, cursor) {
  if (!cursor) {
    return true;
  }
  const time = new Date(row.createdAt).getTime();
  const cursorTime = cursor.date.getTime();
  return (
    time < cursorTime || (time === cursorTime && String(row._id) < cursor.id)
  );
}

function page(rows, limit) {
  return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
}

export class FakeOfferRepository {
  constructor(userRepository, requestRepository) {
    this.userRepository = userRepository;
    this.requestRepository = requestRepository;
    this.offers = new Map();
    this.blocks = new Set();
    this.idempotency = new Map();
    this.evidence = new Map();
    this.evidenceFiles = new Map();
    this.evidenceAccessAudit = [];
    this.conversationRepository = null;
  }

  attachConversationRepository(conversationRepository) {
    this.conversationRepository = conversationRepository;
  }

  idempotencyKey({ principalId, operation, keyHash }) {
    return `${principalId}:${operation}:${keyHash}`;
  }

  async claimIdempotency(input) {
    const key = this.idempotencyKey(input);
    const existing = this.idempotency.get(key);
    if (!existing || new Date(existing.expiresAt) <= input.now) {
      this.idempotency.set(key, { ...input, state: "in_progress" });
      return { outcome: "claimed" };
    }
    if (existing.requestHash !== input.requestHash) {
      return { outcome: "mismatch" };
    }
    return existing.state === "completed"
      ? {
          outcome: "replay",
          responseStatus: existing.responseStatus,
          responseBody: existing.responseBody,
        }
      : { outcome: "in_progress" };
  }

  async completeIdempotency(input) {
    const key = this.idempotencyKey(input);
    const existing = this.idempotency.get(key);
    if (
      !existing ||
      existing.state !== "in_progress" ||
      existing.requestHash !== input.requestHash
    ) {
      return null;
    }
    Object.assign(existing, {
      state: "completed",
      responseStatus: input.responseStatus,
      responseBody: structuredClone(input.responseBody),
      updatedAt: input.now,
    });
    return existing;
  }

  async releaseIdempotency(input) {
    const key = this.idempotencyKey(input);
    const existing = this.idempotency.get(key);
    if (existing?.state === "in_progress") {
      this.idempotency.delete(key);
    }
  }

  relationKey(leftUserId, rightUserId) {
    return [String(leftUserId), String(rightUserId)].sort().join(":");
  }

  block(leftUserId, rightUserId) {
    this.blocks.add(this.relationKey(leftUserId, rightUserId));
  }

  async isBlocked(leftUserId, rightUserId) {
    return this.blocks.has(this.relationKey(leftUserId, rightUserId));
  }

  async findOpenRequest(requestId) {
    const request = this.requestRepository.requests.get(String(requestId));
    if (
      !request ||
      !["published", "partially_solved"].includes(request.status) ||
      request.visibility !== "public"
    ) {
      return null;
    }
    const owner = this.userRepository.users.get(String(request.ownerId));
    return owner?.accountStatus === "active"
      ? { ...request, ownerId: publicPerson(owner) }
      : null;
  }

  async findActiveOffer(requestId, helperId, needItemId) {
    return (
      [...this.offers.values()].find(
        (offer) =>
          String(offer.requestId) === String(requestId) &&
          String(offer.helperId) === String(helperId) &&
          String(offer.needItemId) === String(needItemId) &&
          offer.activeKey,
      ) ?? null
    );
  }

  async create(data, now) {
    const request = this.requestRepository.requests.get(String(data.requestId));
    if (
      !request ||
      !["published", "partially_solved"].includes(request.status) ||
      request.visibility !== "public" ||
      String(request.ownerId) === String(data.helperId)
    ) {
      return null;
    }
    if (
      await this.findActiveOffer(data.requestId, data.helperId, data.needItemId)
    ) {
      const error = new Error("Duplicate active offer");
      error.code = 11000;
      error.keyPattern = { activeKey: 1 };
      throw error;
    }
    const offer = {
      _id: objectId(),
      ...data,
      status: "pending",
      activeKey: `${data.requestId}:${data.helperId}:${data.needItemId}`,
      acceptedAt: null,
      startedAt: null,
      completedAt: null,
      completionSubmittedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.offers.set(offer._id, offer);
    request.offerActivityVersion = (request.offerActivityVersion ?? 0) + 1;
    request.updatedAt = now;
    return offer;
  }

  hydrate(offer) {
    if (!offer) {
      return null;
    }
    const helper = this.userRepository.users.get(String(offer.helperId));
    const request = this.requestRepository.requests.get(
      String(offer.requestId),
    );
    const owner = request
      ? this.userRepository.users.get(String(request.ownerId))
      : null;
    return {
      ...offer,
      helperId: publicPerson(helper),
      requestId: request
        ? { ...request, ownerId: publicPerson(owner) }
        : String(offer.requestId),
    };
  }

  async findHydratedById(offerId) {
    return this.hydrate(this.offers.get(String(offerId)));
  }

  participantsAvailable(request, helperId) {
    const owner = this.userRepository.users.get(String(request.ownerId));
    const helper = this.userRepository.users.get(String(helperId));
    return Boolean(
      owner?.accountStatus === "active" &&
      helper?.accountStatus === "active" &&
      !this.blocks.has(this.relationKey(request.ownerId, helperId)),
    );
  }

  async acceptAtomically({ offerId, ownerId, now }) {
    const offer = this.offers.get(String(offerId));
    const request = offer
      ? this.requestRepository.requests.get(String(offer.requestId))
      : null;
    if (!offer || !request || String(request.ownerId) !== String(ownerId)) {
      return { outcome: "not_found", offer: null };
    }
    if (offer.status === "accepted") {
      this.conversationRepository?.ensureForAcceptedOffer(
        offer,
        offer.acceptedAt ?? now,
      );
      return { outcome: "accepted", offer: this.hydrate(offer) };
    }
    if (offer.status !== "pending") {
      return { outcome: "resolved", offer: this.hydrate(offer) };
    }
    if (
      !["published", "partially_solved"].includes(request.status) ||
      !this.participantsAvailable(request, offer.helperId)
    ) {
      return { outcome: "request_unavailable", offer: this.hydrate(offer) };
    }
    const needItem = request.needItems.find(
      (item) => String(item._id) === String(offer.needItemId),
    );
    if (!needItem || needItem.type !== offer.helpType) {
      return { outcome: "request_unavailable", offer: this.hydrate(offer) };
    }

    if (offer.helpType === "money") {
      const remaining =
        needItem.estimatedValueCentavos -
        (needItem.solvedValueCentavos ?? 0) -
        (needItem.reservedValueCentavos ?? 0);
      if (remaining < offer.pledgedValueCentavos) {
        return { outcome: "insufficient", offer: this.hydrate(offer) };
      }
      needItem.reservedValueCentavos =
        (needItem.reservedValueCentavos ?? 0) + offer.pledgedValueCentavos;
    } else {
      const remaining =
        needItem.quantity -
        (needItem.solvedQuantity ?? 0) -
        (needItem.reservedQuantity ?? 0);
      if (remaining < offer.quantity) {
        return { outcome: "insufficient", offer: this.hydrate(offer) };
      }
      needItem.reservedQuantity =
        (needItem.reservedQuantity ?? 0) + offer.quantity;
    }
    Object.assign(offer, {
      status: "accepted",
      acceptedAt: now,
      updatedAt: now,
    });
    request.updatedAt = now;
    this.conversationRepository?.ensureForAcceptedOffer(offer, now);
    return { outcome: "accepted", offer: this.hydrate(offer) };
  }

  async reject({ offerId, ownerId, now }) {
    const offer = this.offers.get(String(offerId));
    const request = offer
      ? this.requestRepository.requests.get(String(offer.requestId))
      : null;
    if (!offer || !request || String(request.ownerId) !== String(ownerId)) {
      return { outcome: "not_found", offer: null };
    }
    if (offer.status === "rejected") {
      return { outcome: "rejected", offer: this.hydrate(offer) };
    }
    if (offer.status !== "pending") {
      return { outcome: "resolved", offer: this.hydrate(offer) };
    }
    Object.assign(offer, {
      status: "rejected",
      activeKey: undefined,
      updatedAt: now,
    });
    return { outcome: "rejected", offer: this.hydrate(offer) };
  }

  async withdraw({ offerId, helperId, now }) {
    const offer = this.offers.get(String(offerId));
    if (!offer || String(offer.helperId) !== String(helperId)) {
      return { outcome: "not_found", offer: null };
    }
    if (offer.status === "withdrawn") {
      return { outcome: "withdrawn", offer: this.hydrate(offer) };
    }
    if (offer.status !== "pending") {
      return { outcome: "resolved", offer: this.hydrate(offer) };
    }
    Object.assign(offer, {
      status: "withdrawn",
      activeKey: undefined,
      updatedAt: now,
    });
    return { outcome: "withdrawn", offer: this.hydrate(offer) };
  }

  async start({ offerId, helperId, now }) {
    const offer = this.offers.get(String(offerId));
    const request = offer
      ? this.requestRepository.requests.get(String(offer.requestId))
      : null;
    if (!offer || String(offer.helperId) !== String(helperId)) {
      return { outcome: "not_found", offer: null };
    }
    if (offer.status === "in_progress") {
      return { outcome: "started", offer: this.hydrate(offer) };
    }
    if (offer.status !== "accepted") {
      return { outcome: "resolved", offer: this.hydrate(offer) };
    }
    if (
      !request ||
      !["published", "partially_solved"].includes(request.status) ||
      !this.participantsAvailable(request, helperId)
    ) {
      return { outcome: "request_unavailable", offer: this.hydrate(offer) };
    }
    Object.assign(offer, {
      status: "in_progress",
      startedAt: now,
      updatedAt: now,
    });
    return { outcome: "started", offer: this.hydrate(offer) };
  }

  async submitCompletion({
    offerId,
    helperId,
    note,
    actualMinutes,
    fileIds = [],
    now,
  }) {
    const offer = this.offers.get(String(offerId));
    if (!offer || String(offer.helperId) !== String(helperId))
      return { outcome: "not_found", offer: null };
    if (offer.status === "completion_submitted")
      return {
        outcome: "submitted",
        offer: this.hydrate(offer),
        evidence: this.evidence.get(String(offerId)),
      };
    if (offer.status !== "in_progress")
      return { outcome: "resolved", offer: this.hydrate(offer) };
    if (actualMinutes !== null && !["skill", "time"].includes(offer.helpType))
      return { outcome: "duration_not_applicable", offer: this.hydrate(offer) };
    const request = this.requestRepository.requests.get(
      String(offer.requestId),
    );
    if (
      !request ||
      !["published", "partially_solved"].includes(request.status) ||
      !this.participantsAvailable(request, helperId)
    )
      return { outcome: "request_unavailable", offer: this.hydrate(offer) };
    const files = fileIds.map((id) => this.evidenceFiles.get(String(id)));
    if (
      files.some(
        (file) =>
          !file ||
          String(file.offerId) !== String(offerId) ||
          String(file.helperId) !== String(helperId) ||
          new Date(file.uploadedAt) < new Date(now.getTime() - 60 * 60 * 1000),
      )
    )
      return { outcome: "evidence_invalid", offer: this.hydrate(offer) };
    offer.status = "completion_submitted";
    offer.completionSubmittedAt = now;
    offer.updatedAt = now;
    const evidence = {
      offerId,
      submittedBy: helperId,
      note,
      actualMinutes,
      files: files.map((file) => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
      })),
      submittedAt: now,
      confirmedBy: null,
      confirmedAt: null,
      disputedBy: null,
      disputedAt: null,
      disputeReason: null,
    };
    this.evidence.set(String(offerId), evidence);
    for (const file of files) file.attachedAt = now;
    return { outcome: "submitted", offer: this.hydrate(offer), evidence };
  }

  async disputeCompletion({ offerId, ownerId, reason, now }) {
    const offer = this.offers.get(String(offerId));
    const request = offer
      ? this.requestRepository.requests.get(String(offer.requestId))
      : null;
    if (!offer || !request || String(request.ownerId) !== String(ownerId))
      return { outcome: "not_found", offer: null };
    const evidence = this.evidence.get(String(offerId));
    if (offer.status === "disputed")
      return { outcome: "disputed", offer: this.hydrate(offer), evidence };
    if (offer.status !== "completion_submitted")
      return { outcome: "resolved", offer: this.hydrate(offer) };
    if (!["published", "partially_solved"].includes(request.status))
      return { outcome: "request_unavailable", offer: this.hydrate(offer) };
    offer.status = "disputed";
    offer.updatedAt = now;
    Object.assign(evidence, {
      disputedBy: ownerId,
      disputedAt: now,
      disputeReason: reason,
    });
    return { outcome: "disputed", offer: this.hydrate(offer), evidence };
  }

  async confirmCompletion({ offerId, ownerId, now }) {
    const offer = this.offers.get(String(offerId));
    const request = offer
      ? this.requestRepository.requests.get(String(offer.requestId))
      : null;
    if (!offer || !request || String(request.ownerId) !== String(ownerId))
      return { outcome: "not_found", offer: null };
    const evidence = this.evidence.get(String(offerId));
    if (offer.status === "completed")
      return { outcome: "completed", offer: this.hydrate(offer), evidence };
    if (offer.status !== "completion_submitted")
      return { outcome: "resolved", offer: this.hydrate(offer) };
    if (
      !["published", "partially_solved"].includes(request.status) ||
      !this.participantsAvailable(request, offer.helperId)
    )
      return { outcome: "request_unavailable", offer: this.hydrate(offer) };
    const item = request.needItems.find(
      (need) => String(need._id) === String(offer.needItemId),
    );
    if (!item || item.type !== offer.helpType)
      return { outcome: "request_unavailable", offer: this.hydrate(offer) };
    const reservedField =
      offer.helpType === "money" ? "reservedValueCentavos" : "reservedQuantity";
    const solvedField =
      offer.helpType === "money" ? "solvedValueCentavos" : "solvedQuantity";
    const totalField =
      offer.helpType === "money" ? "estimatedValueCentavos" : "quantity";
    const amount =
      offer.helpType === "money" ? offer.pledgedValueCentavos : offer.quantity;
    if (
      (item[reservedField] ?? 0) < amount ||
      (item[solvedField] ?? 0) + amount > item[totalField]
    )
      return { outcome: "insufficient", offer: this.hydrate(offer) };
    item[reservedField] -= amount;
    item[solvedField] = (item[solvedField] ?? 0) + amount;
    offer.status = "completed";
    offer.completedAt = now;
    offer.updatedAt = now;
    offer.activeKey = undefined;
    Object.assign(evidence, { confirmedBy: ownerId, confirmedAt: now });
    request.status = requestIsFullySolved(request.needItems)
      ? "solved"
      : requestHasConfirmedProgress(request.needItems)
        ? "partially_solved"
        : "published";
    if (request.status === "solved") {
      request.solvedAt = now;
      for (const pending of this.offers.values()) {
        if (
          String(pending.requestId) === String(request._id) &&
          pending.status === "pending"
        ) {
          pending.status = "cancelled";
          pending.activeKey = undefined;
          pending.updatedAt = now;
        }
      }
    }
    request.updatedAt = now;
    request.offerActivityVersion = (request.offerActivityVersion ?? 0) + 1;
    return { outcome: "completed", offer: this.hydrate(offer), evidence };
  }

  async findEvidenceForParticipant(offerId, participantId) {
    const offer = this.offers.get(String(offerId));
    const request = offer
      ? this.requestRepository.requests.get(String(offer.requestId))
      : null;
    if (
      !offer ||
      !request ||
      ![String(request.ownerId), String(offer.helperId)].includes(
        String(participantId),
      )
    )
      return null;
    return this.evidence.get(String(offerId)) ?? null;
  }

  async uploadEvidenceFile({ offerId, helperId, bytes, mimeType, name, now }) {
    const offer = this.offers.get(String(offerId));
    const request = offer
      ? this.requestRepository.requests.get(String(offer.requestId))
      : null;
    if (
      !offer ||
      String(offer.helperId) !== String(helperId) ||
      offer.status !== "in_progress" ||
      !request ||
      !["published", "partially_solved"].includes(request.status) ||
      !this.participantsAvailable(request, helperId)
    )
      return null;
    const verified = validateEvidenceFile({ bytes, mimeType, name });
    const file = {
      id: objectId(),
      ...verified,
      offerId,
      helperId,
      uploadedAt: now,
      bytes: Buffer.from(bytes),
    };
    this.evidenceFiles.set(file.id, file);
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
    };
  }

  async readEvidenceFile({ offerId, fileId, participantId }) {
    const evidence = await this.findEvidenceForParticipant(
      offerId,
      participantId,
    );
    if (!evidence?.files.some((file) => file.id === String(fileId)))
      return null;
    const file = this.evidenceFiles.get(String(fileId));
    return file
      ? { bytes: file.bytes, name: file.name, mimeType: file.mimeType }
      : null;
  }

  async recordEvidenceAccess(event) {
    this.evidenceAccessAudit.push(event);
  }

  async listForHelper({ helperId, status, cursor, limit }) {
    const rows = [...this.offers.values()]
      .filter(
        (offer) =>
          String(offer.helperId) === String(helperId) &&
          (!status || offer.status === status) &&
          afterCursor(offer, cursor),
      )
      .sort(
        (left, right) =>
          new Date(right.createdAt) - new Date(left.createdAt) ||
          String(right._id).localeCompare(String(left._id)),
      )
      .map((offer) => this.hydrate(offer));
    return page(rows, limit);
  }

  async listForRequestOwner({ requestId, ownerId, status, cursor, limit }) {
    const request = this.requestRepository.requests.get(String(requestId));
    if (!request || String(request.ownerId) !== String(ownerId)) {
      return null;
    }
    const rows = [...this.offers.values()]
      .filter(
        (offer) =>
          String(offer.requestId) === String(requestId) &&
          (!status || offer.status === status) &&
          afterCursor(offer, cursor),
      )
      .sort(
        (left, right) =>
          new Date(right.createdAt) - new Date(left.createdAt) ||
          String(right._id).localeCompare(String(left._id)),
      )
      .map((offer) => this.hydrate(offer));
    return page(rows, limit);
  }

  cancelForRequest(request, now) {
    for (const offer of this.offers.values()) {
      if (
        String(offer.requestId) !== String(request._id) ||
        !["pending", "accepted", "in_progress"].includes(offer.status)
      ) {
        continue;
      }
      const needItem = request.needItems.find(
        (item) => String(item._id) === String(offer.needItemId),
      );
      if (needItem && ["accepted", "in_progress"].includes(offer.status)) {
        if (offer.helpType === "money") {
          needItem.reservedValueCentavos = Math.max(
            0,
            (needItem.reservedValueCentavos ?? 0) - offer.pledgedValueCentavos,
          );
        } else {
          needItem.reservedQuantity = Math.max(
            0,
            (needItem.reservedQuantity ?? 0) - offer.quantity,
          );
        }
      }
      Object.assign(offer, {
        status: "cancelled",
        activeKey: undefined,
        updatedAt: now,
      });
    }
    this.conversationRepository?.closeForRequest(request._id, now);
  }
}
