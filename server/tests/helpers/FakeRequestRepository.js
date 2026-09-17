import { randomBytes } from "node:crypto";

function objectId() {
  return randomBytes(12).toString("hex");
}

function ownerView(user) {
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

function compareRows(left, right, field, direction) {
  const leftTime = new Date(field(left)).getTime();
  const rightTime = new Date(field(right)).getTime();
  if (leftTime !== rightTime) {
    return (leftTime - rightTime) * direction;
  }
  return left._id.localeCompare(right._id) * direction;
}

function afterCursor(row, cursor, field, direction) {
  if (!cursor) {
    return true;
  }
  const time = new Date(field(row)).getTime();
  const cursorTime = cursor.date.getTime();
  return direction === 1
    ? time > cursorTime || (time === cursorTime && row._id > cursor.id)
    : time < cursorTime || (time === cursorTime && row._id < cursor.id);
}

function page(rows, limit) {
  return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
}

function discoveryCompare(left, right) {
  for (const [field, direction, date] of [
    ["discoverySkillMatch", -1, false],
    ["discoveryVerifiedRank", -1, false],
    ["discoveryUrgencyRank", -1, false],
    ["discoveryNeededBy", 1, true],
    ["discoveryNearbyRank", -1, false],
    ["discoveryPublishedAt", 1, true],
  ]) {
    const leftValue = date ? new Date(left[field]).getTime() : left[field];
    const rightValue = date ? new Date(right[field]).getTime() : right[field];
    if (leftValue !== rightValue) return (leftValue - rightValue) * direction;
  }
  return left._id.localeCompare(right._id);
}

export class FakeRequestRepository {
  constructor(userRepository) {
    this.userRepository = userRepository;
    this.requests = new Map();
    this.auditLogs = [];
    this.offerRepository = null;
    this.giveawayRepository = null;
  }

  attachOfferRepository(offerRepository) {
    this.offerRepository = offerRepository;
  }

  attachGiveawayRepository(giveawayRepository) {
    this.giveawayRepository = giveawayRepository;
  }

  async findDiscoveryViewer(userId) {
    const user = this.userRepository.users.get(String(userId));
    return user?.accountStatus === "active"
      ? { _id: user._id, skills: user.skills ?? [], location: user.location }
      : null;
  }

  async createDraft(ownerId, data, now) {
    const request = {
      _id: objectId(),
      ownerId: String(ownerId),
      title: "",
      description: "",
      category: "",
      helpTypes: [],
      visibility: "public",
      urgency: "normal",
      location: {
        country: "Philippines",
        province: null,
        city: null,
        barangay: null,
      },
      publicLocation: { province: null, city: null },
      neededBy: null,
      estimatedValueCentavos: 0,
      currency: "PHP",
      needItems: [],
      requiredSkills: [],
      status: "draft",
      moderation: {
        submittedAt: null,
        reviewerId: null,
        reviewedAt: null,
        notes: null,
      },
      verificationRequirements: [],
      safetyFlags: [],
      publishedAt: null,
      solvedAt: null,
      offerActivityVersion: 0,
      createdAt: now,
      updatedAt: now,
      ...data,
    };
    request.needItems = request.needItems.map((item) => ({
      _id: objectId(),
      ...item,
    }));
    this.requests.set(request._id, request);
    return request;
  }

  async findOwnedById(requestId, ownerId) {
    const request = this.requests.get(String(requestId));
    return request && request.ownerId === String(ownerId) ? request : null;
  }

  async updateOwnedEditable(requestId, ownerId, changes, now) {
    const request = await this.findOwnedById(requestId, ownerId);
    if (!request || !["draft", "changes_requested"].includes(request.status)) {
      return null;
    }
    if (changes.needItems) {
      changes.needItems = changes.needItems.map((item) => ({
        _id: objectId(),
        ...item,
      }));
    }
    Object.assign(request, changes, { updatedAt: now });
    return request;
  }

  async submitOwned(requestId, ownerId, submission, now) {
    const request = await this.findOwnedById(requestId, ownerId);
    if (!request || !["draft", "changes_requested"].includes(request.status)) {
      return null;
    }
    Object.assign(request, submission, {
      status: "pending_review",
      updatedAt: now,
    });
    Object.assign(request.moderation, {
      submittedAt: now,
      reviewerId: null,
      reviewedAt: null,
    });
    return request;
  }

  async cancelOwned(requestId, ownerId, now) {
    const request = await this.findOwnedById(requestId, ownerId);
    if (
      !request ||
      ![
        "draft",
        "changes_requested",
        "pending_review",
        "published",
        "partially_solved",
      ].includes(request.status)
    ) {
      return null;
    }
    if (
      [...(this.offerRepository?.offers.values() ?? [])].some(
        (offer) =>
          String(offer.requestId) === String(requestId) &&
          ["completion_submitted", "disputed"].includes(offer.status),
      )
    )
      return null;
    const giveawayReservations = [
      ...(this.giveawayRepository?.reservationRecords.values() ?? []),
    ].filter(
      (reservation) =>
        String(reservation.requestId) === String(requestId) &&
        reservation.status === "reserved",
    );
    if (
      giveawayReservations.some(
        (reservation) =>
          reservation.donorConfirmedAt || reservation.recipientConfirmedAt,
      )
    )
      return null;
    for (const reservation of giveawayReservations) {
      const item = this.giveawayRepository.items.get(
        String(reservation.itemId),
      );
      if (item) {
        item.reservedQuantity -= reservation.quantity;
        item.status =
          item.givenQuantity >= item.quantity
            ? "given"
            : item.reservedQuantity + item.givenQuantity >= item.quantity
              ? "reserved"
              : "available";
        item.updatedAt = now;
      }
      const needItem = request.needItems.find(
        (need) => String(need._id) === String(reservation.needItemId),
      );
      if (needItem) needItem.reservedQuantity -= reservation.quantity;
      reservation.status = "cancelled";
      reservation.cancelledAt = now;
      reservation.cancelledBy = String(ownerId);
      reservation.updatedAt = now;
      delete reservation.activeKey;
    }
    Object.assign(request, { status: "cancelled", updatedAt: now });
    this.offerRepository?.cancelForRequest(request, now);
    return request;
  }

  populate(request, requireActive = false) {
    const user = this.userRepository.users.get(String(request.ownerId));
    if (requireActive && user?.accountStatus !== "active") {
      return { ...request, ownerId: null };
    }
    return { ...request, ownerId: ownerView(user) };
  }

  async findVisibleById(requestId) {
    const request = this.requests.get(String(requestId));
    if (
      !request ||
      !["published", "partially_solved", "solved"].includes(request.status) ||
      request.visibility !== "public"
    ) {
      return null;
    }
    return this.populate(request, true);
  }

  async listPublic({ limit, cursor, category, helpType, urgency }) {
    const rows = [...this.requests.values()]
      .filter(
        (request) =>
          ["published", "partially_solved"].includes(request.status) &&
          request.visibility === "public" &&
          (!category || request.category === category) &&
          (!helpType || request.helpTypes.includes(helpType)) &&
          (!urgency || request.urgency === urgency) &&
          afterCursor(request, cursor, (value) => value.publishedAt, -1),
      )
      .sort((left, right) =>
        compareRows(left, right, (value) => value.publishedAt, -1),
      )
      .map((request) => this.populate(request, true));
    return page(rows, limit);
  }

  async listDiscovery({
    mode,
    selectedSkills,
    city,
    province,
    category,
    helpType,
    urgency,
    budgetCentavos,
    excludedOwnerId,
    cursor,
    limit,
  }) {
    const normalized = new Set(selectedSkills);
    const rows = [...this.requests.values()]
      .filter((item) => {
        const owner = this.userRepository.users.get(String(item.ownerId));
        return (
          ["published", "partially_solved"].includes(item.status) &&
          item.visibility === "public" &&
          (!excludedOwnerId ||
            String(item.ownerId) !== String(excludedOwnerId)) &&
          owner?.accountStatus === "active" &&
          (!category || item.category === category) &&
          (!helpType || item.helpTypes.includes(helpType)) &&
          (!urgency || item.urgency === urgency) &&
          (!["skills", "no_money"].includes(mode) ||
            item.helpTypes.some((value) => ["skill", "time"].includes(value)))
        );
      })
      .map((item) => {
        const owner = this.userRepository.users.get(String(item.ownerId));
        const matchedSkills = (item.requiredSkills ?? [])
          .map((value) => value.trim().toLocaleLowerCase("en"))
          .filter((value) => normalized.has(value));
        const provinceMatch = Boolean(
          province &&
          item.publicLocation?.province?.toLocaleLowerCase("en") === province,
        );
        const cityMatch = Boolean(
          city &&
          provinceMatch &&
          item.publicLocation?.city?.toLocaleLowerCase("en") === city,
        );
        const financialRemaining = (item.needItems ?? []).reduce(
          (sum, need) => {
            if (need.type === "money")
              return (
                sum +
                Math.max(
                  0,
                  need.estimatedValueCentavos -
                    (need.solvedValueCentavos ?? 0) -
                    (need.reservedValueCentavos ?? 0),
                )
              );
            if (need.type !== "item") return sum;
            const remaining = Math.max(
              0,
              need.quantity -
                (need.solvedQuantity ?? 0) -
                (need.reservedQuantity ?? 0),
            );
            return (
              sum +
              Math.ceil(
                need.estimatedValueCentavos * (remaining / need.quantity),
              )
            );
          },
          0,
        );
        const estimatedMinutes = (item.needItems ?? []).reduce((sum, need) => {
          if (!["skill", "time"].includes(need.type) || !need.estimatedMinutes)
            return sum;
          const remaining = Math.max(
            0,
            need.quantity -
              (need.solvedQuantity ?? 0) -
              (need.reservedQuantity ?? 0),
          );
          return (
            sum + Math.ceil(need.estimatedMinutes * (remaining / need.quantity))
          );
        }, 0);
        return {
          ...this.populate(item, true),
          discoveryMatchedSkills: matchedSkills,
          discoverySkillMatch: matchedSkills.length,
          discoveryVerifiedRank: [
            "EMAIL_VERIFIED",
            "IDENTITY_VERIFIED",
            "PARTNER_VERIFIED",
          ].includes(owner.verification?.level)
            ? 1
            : 0,
          discoveryUrgencyRank:
            item.urgency === "time_sensitive"
              ? 2
              : item.urgency === "important"
                ? 1
                : 0,
          discoveryNearbyRank: cityMatch ? 2 : provinceMatch ? 1 : 0,
          discoveryFinancialRemaining: financialRemaining,
          discoveryRemainingBudgetCentavos:
            budgetCentavos === null ? null : financialRemaining,
          discoveryEstimatedMinutes: estimatedMinutes || null,
          discoveryNeededBy:
            item.neededBy ?? new Date("9999-12-31T23:59:59.999Z"),
          discoveryPublishedAt: item.publishedAt ?? item.createdAt,
        };
      })
      .filter(
        (item) =>
          (!["skills", "no_money"].includes(mode) ||
            item.discoverySkillMatch > 0) &&
          (mode !== "nearby" || item.discoveryNearbyRank > 0) &&
          (budgetCentavos === null ||
            (item.discoveryFinancialRemaining > 0 &&
              item.discoveryFinancialRemaining <= budgetCentavos)),
      )
      .sort(discoveryCompare)
      .filter((item) => {
        if (!cursor) return true;
        return (
          discoveryCompare(item, {
            _id: cursor.id,
            discoverySkillMatch: cursor.skillMatch,
            discoveryVerifiedRank: cursor.verified,
            discoveryUrgencyRank: cursor.urgency,
            discoveryNeededBy: cursor.neededBy,
            discoveryNearbyRank: cursor.nearby,
            discoveryPublishedAt: cursor.publishedAt,
          }) > 0
        );
      });
    return page(rows, limit);
  }

  async listOwned({ ownerId, limit, cursor }) {
    const rows = [...this.requests.values()]
      .filter(
        (request) =>
          request.ownerId === String(ownerId) &&
          afterCursor(request, cursor, (value) => value.updatedAt, -1),
      )
      .sort((left, right) =>
        compareRows(left, right, (value) => value.updatedAt, -1),
      );
    return page(rows, limit);
  }

  async findForModeration(requestId) {
    const request = this.requests.get(String(requestId));
    return request ? this.populate(request) : null;
  }

  async listForModeration({ status, limit, cursor }) {
    const rows = [...this.requests.values()]
      .filter(
        (request) =>
          request.status === status &&
          request.moderation.submittedAt &&
          afterCursor(
            request,
            cursor,
            (value) => value.moderation.submittedAt,
            1,
          ),
      )
      .sort((left, right) =>
        compareRows(left, right, (value) => value.moderation.submittedAt, 1),
      )
      .map((request) => this.populate(request));
    return page(rows, limit);
  }

  async moderateAndAudit({
    requestId,
    actorId,
    nextStatus,
    action,
    notes,
    ipHash,
    now,
  }) {
    const request = this.requests.get(String(requestId));
    if (
      !request ||
      request.ownerId === String(actorId) ||
      request.status !== "pending_review"
    ) {
      return null;
    }
    Object.assign(request, {
      status: nextStatus,
      publishedAt: nextStatus === "published" ? now : null,
      updatedAt: now,
    });
    Object.assign(request.moderation, {
      reviewerId: String(actorId),
      reviewedAt: now,
      notes,
    });
    this.auditLogs.push({
      actorId: String(actorId),
      action,
      targetType: "help_request",
      targetId: String(requestId),
      metadata: { fromStatus: "pending_review", toStatus: nextStatus },
      ipHash,
      createdAt: now,
    });
    return request;
  }
}
