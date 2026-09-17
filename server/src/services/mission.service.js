import { createHash } from "node:crypto";

import {
  serializeMatchedMission,
  serializeMissionContribution,
  serializeModerationMission,
  serializeOwnedMission,
  serializePublicMission,
} from "../serializers/mission.serializer.js";
import { AppError } from "../utils/AppError.js";
import { hashIpAddress } from "../utils/authCrypto.js";
import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";
import { assessRequestSafety } from "../utils/requestSafety.js";

function missionError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function normalizeSkills(skills = []) {
  return [
    ...new Set(skills.map((skill) => skill.trim().toLocaleLowerCase("en"))),
  ];
}

function normalizeInput(input) {
  return {
    ...input,
    requiredResources: input.requiredResources?.map((resource) => ({
      ...resource,
      requiredSkills: normalizeSkills(resource.requiredSkills),
    })),
  };
}

function buildPage({ page, scope, field, serializer }) {
  const items = page.items.map(serializer).filter(Boolean);
  const last = page.items.at(-1);
  const cursorDate = field
    .split(".")
    .reduce((value, segment) => value?.[segment], last);
  return {
    items,
    pageInfo: {
      hasNextPage: page.hasNextPage,
      nextCursor:
        page.hasNextPage && last
          ? encodePageCursor({ scope, date: cursorDate, id: idOf(last) })
          : null,
    },
  };
}

function transitionError(outcome) {
  const errors = {
    not_found: [
      404,
      "MISSION_NOT_FOUND",
      "Community mission or contribution not found",
    ],
    unavailable: [
      409,
      "MISSION_UNAVAILABLE",
      "This mission is not available for that operation",
    ],
    resource_mismatch: [
      422,
      "MISSION_RESOURCE_MISMATCH",
      "Select a resource from this mission",
    ],
    duration_mismatch: [
      422,
      "MISSION_DURATION_MISMATCH",
      "Time is required only for skill and time contributions",
    ],
    insufficient: [
      409,
      "MISSION_CAPACITY_UNAVAILABLE",
      "The selected resource no longer has enough open capacity",
    ],
    duplicate: [
      409,
      "MISSION_CONTRIBUTION_EXISTS",
      "You already have an active contribution for this resource",
    ],
    resolved: [
      409,
      "MISSION_CONTRIBUTION_RESOLVED",
      "This contribution cannot transition from its current state",
    ],
    state_changed: [
      409,
      "MISSION_STATE_CHANGED",
      "Mission state changed; reload and try again",
    ],
  };
  const [status, code, message] = errors[outcome] ?? errors.state_changed;
  return missionError(status, code, message);
}

export class MissionService {
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
      throw missionError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "This idempotency key was already used for another payload",
      );
    if (claim.outcome === "in_progress")
      throw missionError(
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

  create(creatorId, input, idempotencyKey) {
    const normalized = normalizeInput(input);
    return this.runIdempotent(
      {
        principalId: creatorId,
        operation: "mission.create",
        key: idempotencyKey,
        payload: normalized,
      },
      async () => ({
        mission: serializeOwnedMission(
          await this.repository.createMission(
            creatorId,
            normalized,
            this.clock(),
          ),
        ),
      }),
    );
  }

  async update(creatorId, missionId, input) {
    const existing = await this.repository.findOwned(missionId, creatorId);
    if (!existing)
      throw missionError(
        404,
        "MISSION_NOT_FOUND",
        "Community mission not found",
      );
    if (!["draft", "changes_requested"].includes(existing.status))
      throw missionError(
        409,
        "MISSION_NOT_EDITABLE",
        "This mission cannot be edited now",
      );
    const mission = await this.repository.updateOwned(
      missionId,
      creatorId,
      normalizeInput(input),
      this.clock(),
    );
    if (!mission) throw transitionError("state_changed");
    return { mission: serializeOwnedMission(mission) };
  }

  async submit(creatorId, missionId) {
    const existing = await this.repository.findOwned(missionId, creatorId);
    if (!existing)
      throw missionError(
        404,
        "MISSION_NOT_FOUND",
        "Community mission not found",
      );
    if (!["draft", "changes_requested"].includes(existing.status))
      throw missionError(
        409,
        "MISSION_NOT_EDITABLE",
        "This mission cannot be submitted now",
      );
    const safetyFlags = assessRequestSafety({
      title: existing.title,
      description: `${existing.description}\n${existing.evidence?.note ?? ""}`,
      helpTypes: [],
      needItems: existing.requiredResources.map((resource) => ({
        name: resource.name,
        description: resource.description,
        type: resource.type,
      })),
    });
    const mission = await this.repository.submitOwned(
      missionId,
      creatorId,
      safetyFlags,
      this.clock(),
    );
    if (!mission) throw transitionError("state_changed");
    return { mission: serializeOwnedMission(mission) };
  }

  async get(missionId, viewerId) {
    if (viewerId) {
      const owned = await this.repository.findOwned(missionId, viewerId);
      if (owned) return { mission: serializeOwnedMission(owned) };
    }
    const mission = serializePublicMission(
      await this.repository.findPublic(missionId),
    );
    if (!mission)
      throw missionError(
        404,
        "MISSION_NOT_FOUND",
        "Community mission not found",
      );
    return { mission };
  }

  async listPublic(query) {
    const scope = `missions:${query.category ?? ""}:${query.resourceType ?? ""}:${query.province?.toLocaleLowerCase("en") ?? ""}:${query.city?.toLocaleLowerCase("en") ?? ""}`;
    const page = await this.repository.listPublic({
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return buildPage({
      page,
      scope,
      field: "publishedAt",
      serializer: serializePublicMission,
    });
  }

  async listOwned(creatorId, query) {
    const scope = `missions-owner:${creatorId}:${query.status ?? ""}`;
    const page = await this.repository.listOwned({
      creatorId,
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return buildPage({
      page,
      scope,
      field: "updatedAt",
      serializer: serializeOwnedMission,
    });
  }

  async matches(viewerId, query) {
    const viewer = await this.repository.findViewer(viewerId);
    if (!viewer)
      throw missionError(
        409,
        "MISSION_MATCH_PROFILE_UNAVAILABLE",
        "An active profile is required for volunteer matching",
      );
    const criteria = {
      skills: normalizeSkills(viewer.skills),
      location: {
        city: viewer.location?.city ?? null,
        province: viewer.location?.province ?? null,
      },
    };
    if (!criteria.skills.length && !criteria.location.province)
      throw missionError(
        422,
        "MISSION_MATCH_PROFILE_REQUIRED",
        "Add a skill or province to your profile to find matching missions",
      );
    const scope = `mission-matches:${viewerId}:${this.digest(JSON.stringify(criteria))}`;
    const page = await this.repository.listMatches({
      viewerId,
      ...criteria,
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return {
      ...buildPage({
        page,
        scope,
        field: "publishedAt",
        serializer: serializeMatchedMission,
      }),
      criteria,
      rankingPolicy: [
        "saved_skill_or_general_location",
        "oldest_verified_mission",
      ],
    };
  }

  async listForModeration(query) {
    const scope = "mission-moderation:pending_review";
    const page = await this.repository.listForModeration({
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return buildPage({
      page,
      scope,
      field: "moderation.submittedAt",
      serializer: serializeModerationMission,
    });
  }

  async moderate(actor, missionId, decision, notes, context) {
    const existing = await this.repository.findForModeration(missionId);
    if (!existing)
      throw missionError(
        404,
        "MISSION_NOT_FOUND",
        "Community mission not found",
      );
    if (idOf(existing.creatorId) === String(actor.userId))
      throw missionError(
        403,
        "FORBIDDEN",
        "Moderators cannot verify their own missions",
      );
    if (
      existing.creatorId?.accountStatus !== "active" ||
      existing.status !== "pending_review"
    )
      throw transitionError("unavailable");
    const decisions = {
      approve: {
        nextStatus: "published",
        verificationStatus: "verified",
        action: "mission_approved",
        notes: null,
      },
      reject: {
        nextStatus: "rejected",
        verificationStatus: "rejected",
        action: "mission_rejected",
        notes,
      },
      requestChanges: {
        nextStatus: "changes_requested",
        verificationStatus: "unverified",
        action: "mission_changes_requested",
        notes,
      },
    };
    const result = await this.repository.moderateAndAudit({
      missionId,
      actorId: actor.userId,
      ...decisions[decision],
      ipHash: hashIpAddress(
        context?.ipAddress || "unknown",
        this.config.ipHashSecret,
      ),
      now: this.clock(),
    });
    if (!result.mission) throw transitionError("state_changed");
    this.publish(result.notification);
    return {
      mission: serializeModerationMission(
        await this.repository.findForModeration(missionId),
      ),
    };
  }

  contribute(contributorId, missionId, input, idempotencyKey) {
    return this.runIdempotent(
      {
        principalId: contributorId,
        operation: "mission.contribute",
        key: idempotencyKey,
        payload: { missionId, ...input },
      },
      async () => {
        const result = await this.repository.createContribution({
          missionId,
          contributorId,
          input,
          now: this.clock(),
        });
        if (result.outcome !== "created") throw transitionError(result.outcome);
        this.publish(result.notification);
        return {
          contribution: serializeMissionContribution(result.contribution),
        };
      },
    );
  }

  async listContributions(participantId, missionId, query) {
    if (missionId) {
      const owned = await this.repository.findOwned(missionId, participantId);
      if (!owned)
        throw missionError(
          404,
          "MISSION_NOT_FOUND",
          "Community mission not found",
        );
    }
    const scope = `mission-contributions:${participantId}:${missionId ?? "all"}:${query.status ?? ""}`;
    const page = await this.repository.listContributions({
      participantId,
      missionId,
      ...query,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return buildPage({
      page,
      scope,
      field: "createdAt",
      serializer: serializeMissionContribution,
    });
  }

  accept(creatorId, contributionId, idempotencyKey) {
    return this.runIdempotent(
      {
        principalId: creatorId,
        operation: "mission.accept",
        key: idempotencyKey,
        payload: { contributionId },
      },
      async () => {
        const result = await this.repository.acceptContribution({
          contributionId,
          creatorId,
          now: this.clock(),
        });
        if (result.outcome !== "accepted")
          throw transitionError(result.outcome);
        this.publish(result.notification);
        return {
          contribution: serializeMissionContribution(result.contribution),
        };
      },
    );
  }

  async transition(actorId, contributionId, action) {
    const operations = {
      reject: {
        actorField: "creatorId",
        from: "pending",
        to: "rejected",
        timestampField: "cancelledAt",
        notificationKind: "mission_contribution_rejected",
      },
      withdraw: {
        actorField: "contributorId",
        from: "pending",
        to: "withdrawn",
        timestampField: "cancelledAt",
        notificationKind: null,
      },
      start: {
        actorField: "contributorId",
        from: "accepted",
        to: "in_progress",
        timestampField: "startedAt",
        notificationKind: null,
      },
    };
    const result = await this.repository.simpleTransition({
      contributionId,
      actorId,
      ...operations[action],
      now: this.clock(),
    });
    if (result.outcome !== operations[action].to)
      throw transitionError(result.outcome);
    this.publish(result.notification);
    return { contribution: serializeMissionContribution(result.contribution) };
  }

  complete(contributorId, contributionId, input, idempotencyKey) {
    return this.runIdempotent(
      {
        principalId: contributorId,
        operation: "mission.complete",
        key: idempotencyKey,
        payload: { contributionId, ...input },
      },
      async () => {
        const result = await this.repository.submitCompletion({
          contributionId,
          contributorId,
          input,
          now: this.clock(),
        });
        if (result.outcome !== "submitted")
          throw transitionError(result.outcome);
        this.publish(result.notification);
        return {
          contribution: serializeMissionContribution(result.contribution),
        };
      },
    );
  }

  confirm(creatorId, contributionId, idempotencyKey) {
    return this.runIdempotent(
      {
        principalId: creatorId,
        operation: "mission.confirm",
        key: idempotencyKey,
        payload: { contributionId },
      },
      async () => {
        const result = await this.repository.confirmCompletion({
          contributionId,
          creatorId,
          now: this.clock(),
        });
        if (result.outcome !== "completed")
          throw transitionError(result.outcome);
        this.publish(result.notification);
        return {
          contribution: serializeMissionContribution(result.contribution),
        };
      },
    );
  }

  async cancel(creatorId, missionId) {
    const result = await this.repository.cancelMission(
      missionId,
      creatorId,
      this.clock(),
    );
    if (!result.mission)
      throw missionError(
        409,
        "MISSION_NOT_CANCELLABLE",
        "This mission cannot be cancelled while completion is awaiting confirmation",
      );
    result.notifications.forEach((notification) => this.publish(notification));
    return { mission: serializeOwnedMission(result.mission) };
  }
}
