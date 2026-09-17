import { createHash } from "node:crypto";

import {
  serializeDiscoveryRequest,
  serializeModerationRequest,
  serializeOwnedRequest,
  serializePublicRequest,
} from "../serializers/request.serializer.js";
import { AppError } from "../utils/AppError.js";
import { hashIpAddress } from "../utils/authCrypto.js";
import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";
import {
  decodeDiscoveryCursor,
  encodeDiscoveryCursor,
} from "../utils/discoveryCursor.js";
import {
  assessRequestSafety,
  safetyGuidanceFor,
} from "../utils/requestSafety.js";

const editableFields = Object.freeze([
  "title",
  "description",
  "category",
  "helpTypes",
  "visibility",
  "urgency",
  "location",
  "neededBy",
  "needItems",
  "requiredSkills",
]);

function requestError(statusCode, code, message, details) {
  return new AppError({ statusCode, code, message, details });
}

function requestNotFound() {
  return requestError(404, "REQUEST_NOT_FOUND", "Request not found");
}

function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function normalizeSkills(values = []) {
  return [
    ...new Set(
      values
        .map((value) => value.trim().toLocaleLowerCase("en"))
        .filter(Boolean),
    ),
  ].sort();
}

function discoveryScope(criteria) {
  return `discovery:${createHash("sha256")
    .update(JSON.stringify(criteria))
    .digest("hex")}`;
}

function discoveryPage(page, scope) {
  const rawItems = page.items;
  const items = rawItems.map(serializeDiscoveryRequest).filter(Boolean);
  const last = rawItems.at(-1);
  return {
    items,
    pageInfo: {
      hasNextPage: page.hasNextPage,
      nextCursor:
        page.hasNextPage && last
          ? encodeDiscoveryCursor({
              scope,
              values: {
                skillMatch: last.discoverySkillMatch,
                verified: last.discoveryVerifiedRank,
                urgency: last.discoveryUrgencyRank,
                neededBy: last.discoveryNeededBy,
                nearby: last.discoveryNearbyRank,
                publishedAt: last.discoveryPublishedAt,
                id: last._id,
              },
            })
          : null,
    },
  };
}

function normalizeLocation(location) {
  if (location === null) {
    return {
      country: "Philippines",
      province: null,
      city: null,
      barangay: null,
    };
  }

  return {
    country: location?.country ?? "Philippines",
    province: location?.province ?? null,
    city: location?.city ?? null,
    barangay: location?.barangay ?? null,
  };
}

function normalizeNeedItems(items) {
  return items?.map((item) => ({
    name: item.name,
    description: item.description,
    type: item.type,
    quantity: item.quantity,
    estimatedValueCentavos: item.estimatedValueCentavos,
    estimatedMinutes: item.estimatedMinutes ?? null,
    solvedQuantity: 0,
    reservedQuantity: 0,
    solvedValueCentavos: 0,
    reservedValueCentavos: 0,
  }));
}

function normalizeEditableInput(input) {
  const changes = Object.fromEntries(
    editableFields
      .filter((field) => Object.hasOwn(input, field))
      .map((field) => [field, input[field]]),
  );

  if (Object.hasOwn(changes, "location")) {
    changes.location = normalizeLocation(changes.location);
  }
  if (Object.hasOwn(changes, "needItems")) {
    changes.needItems = normalizeNeedItems(changes.needItems);
    changes.estimatedValueCentavos = changes.needItems.reduce(
      (sum, item) => sum + item.estimatedValueCentavos,
      0,
    );
  }

  return changes;
}

function validateSubmission(request, config, now) {
  const details = [];
  const issue = (field, message) => details.push({ field, message });

  if (request.title.trim().length < 10) {
    issue("title", "Use a specific title of at least 10 characters");
  }
  if (request.description.trim().length < 50) {
    issue(
      "description",
      "Explain the problem and finish line in at least 50 characters",
    );
  }
  if (!request.category) {
    issue("category", "Choose a request category");
  }
  if (!request.helpTypes.length) {
    issue("helpTypes", "Choose at least one kind of help");
  }
  if (!request.needItems.length) {
    issue("needItems", "Add at least one concrete need item");
  } else if (request.needItems.length > config.maxRequestNeedItems) {
    issue(
      "needItems",
      `A request can contain at most ${config.maxRequestNeedItems} need items`,
    );
  }

  request.needItems.forEach((item, index) => {
    if (item.name.trim().length < 3) {
      issue(`needItems.${index}.name`, "Use a specific need-item name");
    }
    if (item.description.trim().length < 10) {
      issue(
        `needItems.${index}.description`,
        "Explain what this item or task will solve",
      );
    }
    if (!request.helpTypes.includes(item.type)) {
      issue(
        `needItems.${index}.type`,
        "Each need-item type must be selected as a help type",
      );
    }
    if (
      ["money", "item"].includes(item.type) &&
      item.estimatedValueCentavos <= 0
    ) {
      issue(
        `needItems.${index}.estimatedValueCentavos`,
        "Money and item needs require a positive estimated value",
      );
    }
    if (
      ["skill", "time"].includes(item.type) &&
      item.estimatedMinutes !== null &&
      item.estimatedMinutes !== undefined &&
      (!Number.isInteger(item.estimatedMinutes) ||
        item.estimatedMinutes < 15 ||
        item.estimatedMinutes > 10080)
    ) {
      issue(
        `needItems.${index}.estimatedMinutes`,
        "Estimated time must be between 15 and 10,080 minutes",
      );
    }
  });

  request.helpTypes.forEach((helpType) => {
    if (!request.needItems.some((item) => item.type === helpType)) {
      issue("needItems", `Add a concrete ${helpType} need item`);
    }
  });

  if (!request.location?.city || !request.location?.province) {
    issue("location", "City and province are required before submission");
  }
  if (!request.neededBy) {
    issue("neededBy", "Choose when the help is needed");
  } else if (new Date(request.neededBy) <= now) {
    issue("neededBy", "Needed-by date must be in the future");
  }

  const total = request.needItems.reduce(
    (sum, item) => sum + item.estimatedValueCentavos,
    0,
  );
  if (total > config.maxRequestEstimatedValueCentavos) {
    issue(
      "needItems",
      `Combined estimated value exceeds the configured ${config.maxRequestEstimatedValueCentavos}-centavo limit`,
    );
  }

  if (details.length) {
    throw requestError(
      422,
      "REQUEST_INCOMPLETE",
      "Request needs more detail before moderation",
      details,
    );
  }

  return total;
}

function buildPage({ page, scope, dateField, serializer }) {
  const rawItems = page.items;
  const items = rawItems.map(serializer).filter(Boolean);
  const lastItem = rawItems.at(-1);
  return {
    items,
    pageInfo: {
      hasNextPage: page.hasNextPage,
      nextCursor:
        page.hasNextPage && lastItem
          ? encodePageCursor({
              scope,
              date: dateField
                .split(".")
                .reduce((value, key) => value?.[key], lastItem),
              id: idOf(lastItem),
            })
          : null,
    },
  };
}

export class RequestService {
  constructor({ repository, config, publisher, clock = () => new Date() }) {
    this.repository = repository;
    this.config = config;
    this.publisher = publisher;
    this.clock = clock;
  }

  async createDraft(ownerId, input) {
    const request = await this.repository.createDraft(
      ownerId,
      normalizeEditableInput(input),
      this.clock(),
    );
    return { request: serializeOwnedRequest(request) };
  }

  async updateDraft(ownerId, requestId, input) {
    const existing = await this.repository.findOwnedById(requestId, ownerId);
    if (!existing) {
      throw requestNotFound();
    }
    if (!["draft", "changes_requested"].includes(existing.status)) {
      throw requestError(
        409,
        "REQUEST_NOT_EDITABLE",
        "Only draft requests or requests needing changes can be edited",
      );
    }

    const request = await this.repository.updateOwnedEditable(
      requestId,
      ownerId,
      normalizeEditableInput(input),
      this.clock(),
    );
    if (!request) {
      throw requestError(
        409,
        "REQUEST_STATE_CHANGED",
        "Request state changed; reload and try again",
      );
    }
    return { request: serializeOwnedRequest(request) };
  }

  async submit(ownerId, requestId) {
    const existing = await this.repository.findOwnedById(requestId, ownerId);
    if (!existing) {
      throw requestNotFound();
    }
    if (!["draft", "changes_requested"].includes(existing.status)) {
      throw requestError(
        409,
        "REQUEST_NOT_EDITABLE",
        "Request cannot be submitted from its current state",
      );
    }

    const now = this.clock();
    const estimatedValueCentavos = validateSubmission(
      existing,
      this.config,
      now,
    );
    const safetyFlags = assessRequestSafety(existing);
    const request = await this.repository.submitOwned(
      requestId,
      ownerId,
      {
        estimatedValueCentavos,
        publicLocation: {
          city: existing.location.city,
          province: existing.location.province,
        },
        safetyFlags,
      },
      now,
    );
    if (!request) {
      throw requestError(
        409,
        "REQUEST_STATE_CHANGED",
        "Request state changed; reload and try again",
      );
    }
    return {
      request: serializeOwnedRequest(request),
      safetyGuidance: safetyGuidanceFor(safetyFlags),
    };
  }

  async cancel(ownerId, requestId) {
    const existing = await this.repository.findOwnedById(requestId, ownerId);
    if (!existing) {
      throw requestNotFound();
    }
    const request = await this.repository.cancelOwned(
      requestId,
      ownerId,
      this.clock(),
    );
    if (!request) {
      throw requestError(
        409,
        "REQUEST_NOT_AVAILABLE",
        "Request cannot be cancelled from its current state",
      );
    }
    return { request: serializeOwnedRequest(request) };
  }

  async getRequest(requestId, viewerUserId) {
    if (viewerUserId) {
      const owned = await this.repository.findOwnedById(
        requestId,
        viewerUserId,
      );
      if (owned) {
        return { request: serializeOwnedRequest(owned) };
      }
    }

    const request = await this.repository.findVisibleById(requestId);
    const serialized = request ? serializePublicRequest(request) : null;
    if (!serialized) {
      throw requestNotFound();
    }
    return { request: serialized };
  }

  async listPublic(query) {
    const scope = `public:${query.category ?? ""}:${query.helpType ?? ""}:${query.urgency ?? ""}`;
    const cursor = decodePageCursor(query.cursor, scope);
    const page = await this.repository.listPublic({ ...query, cursor });
    return buildPage({
      page,
      scope,
      dateField: "publishedAt",
      serializer: serializePublicRequest,
    });
  }

  async discoveryContext(viewerUserId, query) {
    const profile = viewerUserId
      ? await this.repository.findDiscoveryViewer(viewerUserId)
      : null;
    const selectedSkills = normalizeSkills(
      query.skills?.length ? query.skills : profile?.skills,
    );
    const location = {
      city: query.city ?? profile?.location?.city ?? null,
      province: query.province ?? profile?.location?.province ?? null,
    };
    return { selectedSkills, location };
  }

  async discover(viewerUserId, query) {
    const { selectedSkills, location } = await this.discoveryContext(
      viewerUserId,
      query,
    );
    if (
      ["skills", "no_money"].includes(query.mode) &&
      selectedSkills.length === 0
    ) {
      throw requestError(
        422,
        "DISCOVERY_SKILLS_REQUIRED",
        "Select at least one skill or add skills to your profile",
      );
    }
    if (query.mode === "nearby" && !location.province) {
      throw requestError(
        422,
        "DISCOVERY_LOCATION_REQUIRED",
        "Add a province to your profile or choose a general location",
      );
    }
    if (
      ["skills", "no_money"].includes(query.mode) &&
      query.helpType &&
      !["skill", "time"].includes(query.helpType)
    ) {
      throw requestError(
        422,
        "DISCOVERY_FILTER_CONFLICT",
        "Skill matching can be filtered only to skill or time help",
      );
    }
    const criteria = {
      mode: query.mode,
      selectedSkills,
      city: location.city?.toLocaleLowerCase("en") ?? null,
      province: location.province?.toLocaleLowerCase("en") ?? null,
      category: query.category ?? null,
      helpType: query.helpType ?? null,
      urgency: query.urgency ?? null,
      budgetCentavos: null,
      excludedOwnerId: viewerUserId ?? null,
    };
    const scope = discoveryScope(criteria);
    const page = await this.repository.listDiscovery({
      ...criteria,
      limit: query.limit,
      cursor: decodeDiscoveryCursor(query.cursor, scope),
    });
    return {
      ...discoveryPage(page, scope),
      criteria: {
        mode: query.mode,
        selectedSkills,
        generalLocation: location,
      },
      rankingPolicy: [
        "selected_skill_match",
        "factual_verification",
        "urgency_and_needed_by",
        "same_city_or_province",
        "oldest_reasonable_request",
      ],
    };
  }

  async solvable(viewerUserId, query) {
    const { location } = await this.discoveryContext(viewerUserId, query);
    const criteria = {
      mode: "budget",
      selectedSkills: [],
      city: location.city?.toLocaleLowerCase("en") ?? null,
      province: location.province?.toLocaleLowerCase("en") ?? null,
      category: query.category ?? null,
      helpType: null,
      urgency: query.urgency ?? null,
      budgetCentavos: query.budget,
      excludedOwnerId: viewerUserId ?? null,
    };
    const scope = discoveryScope(criteria);
    const page = await this.repository.listDiscovery({
      ...criteria,
      limit: query.limit,
      cursor: decodeDiscoveryCursor(query.cursor, scope),
    });
    return {
      ...discoveryPage(page, scope),
      criteria: {
        mode: "budget",
        budgetCentavos: query.budget,
        generalLocation: location,
      },
      rankingPolicy: [
        "fully_solvable_within_budget",
        "factual_verification",
        "urgency_and_needed_by",
        "same_city_or_province",
        "oldest_reasonable_request",
      ],
    };
  }

  async listOwned(ownerId, query) {
    const scope = `owner:${ownerId}`;
    const cursor = decodePageCursor(query.cursor, scope);
    const page = await this.repository.listOwned({ ...query, ownerId, cursor });
    return buildPage({
      page,
      scope,
      dateField: "updatedAt",
      serializer: serializeOwnedRequest,
    });
  }

  async listForModeration(query) {
    const scope = `moderation:${query.status}`;
    const cursor = decodePageCursor(query.cursor, scope);
    const page = await this.repository.listForModeration({ ...query, cursor });
    return buildPage({
      page,
      scope,
      dateField: "moderation.submittedAt",
      serializer: serializeModerationRequest,
    });
  }

  async moderate(actorId, requestId, decision, notes, context) {
    const existing = await this.repository.findForModeration(requestId);
    if (!existing) {
      throw requestNotFound();
    }
    if (idOf(existing.ownerId) === String(actorId)) {
      throw requestError(
        403,
        "FORBIDDEN",
        "Moderators cannot review their own requests",
      );
    }
    if (existing.ownerId?.accountStatus !== "active") {
      throw requestError(
        409,
        "REQUEST_NOT_AVAILABLE",
        "The request owner is not currently available",
      );
    }
    if (existing.status !== "pending_review") {
      throw requestError(
        409,
        "REQUEST_NOT_AVAILABLE",
        "Only pending requests can be moderated",
      );
    }

    const decisions = {
      approve: {
        nextStatus: "published",
        action: "request_approved",
        notes: null,
      },
      reject: { nextStatus: "rejected", action: "request_rejected", notes },
      requestChanges: {
        nextStatus: "changes_requested",
        action: "request_changes_requested",
        notes,
      },
    };
    const selected = decisions[decision];
    const updated = await this.repository.moderateAndAudit({
      requestId,
      actorId,
      ...selected,
      ipHash: hashIpAddress(
        context?.ipAddress || "unknown",
        this.config.ipHashSecret,
      ),
      now: this.clock(),
    });
    if (!updated) {
      throw requestError(
        409,
        "REQUEST_STATE_CHANGED",
        "Request state changed; reload and try again",
      );
    }
    if (updated.notification)
      this.publisher?.publishNotification?.({
        recipientId: updated.notification.recipientId,
        notificationId: updated.notification._id,
      });
    const request = await this.repository.findForModeration(requestId);
    return { request: serializeModerationRequest(request) };
  }
}
