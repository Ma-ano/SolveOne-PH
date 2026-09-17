import { randomBytes } from "node:crypto";

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

function openResources(resources) {
  return resources.filter(
    (resource) =>
      (resource.quantity ?? 0) >
      (resource.reservedQuantity ?? 0) + (resource.fulfilledQuantity ?? 0),
  );
}

function notification(recipientId, resourceId, kind) {
  return { _id: objectId(), recipientId, resourceId, kind };
}

export class FakeMissionRepository {
  constructor(userRepository) {
    this.userRepository = userRepository;
    this.missions = new Map();
    this.contributions = new Map();
    this.idempotency = new Map();
    this.audits = [];
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
      responseStatus: input.responseStatus,
      responseBody: input.responseBody,
    });
    return record;
  }

  async releaseIdempotency(input) {
    const id = this.idempotencyId(input);
    if (this.idempotency.get(id)?.state === "in_progress")
      this.idempotency.delete(id);
  }

  hydratedMission(mission) {
    return {
      ...mission,
      creatorId: person(
        this.userRepository.users.get(String(mission.creatorId)),
      ),
    };
  }

  hydratedContribution(contribution) {
    if (!contribution) return null;
    return {
      ...contribution,
      creatorId: person(
        this.userRepository.users.get(String(contribution.creatorId)),
      ),
      contributorId: person(
        this.userRepository.users.get(String(contribution.contributorId)),
      ),
      missionId: {
        ...this.missions.get(String(contribution.missionId)),
      },
    };
  }

  async createMission(creatorId, input, now) {
    const mission = {
      _id: objectId(),
      creatorId: String(creatorId),
      title: input.title,
      description: input.description,
      category: input.category,
      location: { ...input.location },
      publicLocation: {
        city: input.location.city,
        province: input.location.province,
      },
      requiredResources: input.requiredResources.map((resource) => ({
        _id: objectId(),
        ...resource,
        estimatedMinutes: resource.estimatedMinutes ?? null,
        reservedQuantity: 0,
        fulfilledQuantity: 0,
      })),
      evidence: { note: input.evidenceNote },
      verificationStatus: "unverified",
      status: "draft",
      moderation: {
        submittedAt: null,
        reviewerId: null,
        reviewedAt: null,
        notes: null,
      },
      safetyFlags: [],
      activityVersion: 0,
      publishedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.missions.set(mission._id, mission);
    return mission;
  }

  async findOwned(missionId, creatorId) {
    const mission = this.missions.get(String(missionId));
    return mission?.creatorId === String(creatorId) ? mission : null;
  }

  async findPublic(missionId) {
    const mission = this.missions.get(String(missionId));
    if (
      !mission ||
      !["published", "in_progress", "completed"].includes(mission.status) ||
      mission.verificationStatus !== "verified"
    )
      return null;
    const creator = this.userRepository.users.get(String(mission.creatorId));
    return creator?.accountStatus === "active"
      ? this.hydratedMission(mission)
      : null;
  }

  async updateOwned(missionId, creatorId, patch, now) {
    const mission = await this.findOwned(missionId, creatorId);
    if (!mission || !["draft", "changes_requested"].includes(mission.status))
      return null;
    if (patch.evidenceNote !== undefined) {
      mission.evidence.note = patch.evidenceNote;
      delete patch.evidenceNote;
    }
    Object.assign(mission, patch, { updatedAt: now });
    if (patch.location)
      mission.publicLocation = {
        city: patch.location.city,
        province: patch.location.province,
      };
    return mission;
  }

  async submitOwned(missionId, creatorId, safetyFlags, now) {
    const mission = await this.findOwned(missionId, creatorId);
    if (!mission || !["draft", "changes_requested"].includes(mission.status))
      return null;
    Object.assign(mission, {
      status: "pending_review",
      verificationStatus: "pending",
      safetyFlags,
      updatedAt: now,
    });
    Object.assign(mission.moderation, {
      submittedAt: now,
      reviewerId: null,
      reviewedAt: null,
      notes: null,
    });
    return mission;
  }

  async listPublic({ category, resourceType, province, city, limit, cursor }) {
    const rows = [...this.missions.values()]
      .filter((mission) => {
        const owner = this.userRepository.users.get(String(mission.creatorId));
        return (
          ["published", "in_progress", "completed"].includes(mission.status) &&
          mission.verificationStatus === "verified" &&
          owner?.accountStatus === "active" &&
          (!category || mission.category === category) &&
          (!resourceType ||
            mission.requiredResources.some(
              (resource) => resource.type === resourceType,
            )) &&
          (!province ||
            mission.publicLocation.province.toLocaleLowerCase("en") ===
              province.toLocaleLowerCase("en")) &&
          (!city ||
            mission.publicLocation.city.toLocaleLowerCase("en") ===
              city.toLocaleLowerCase("en")) &&
          afterCursor(mission, cursor, "publishedAt", -1)
        );
      })
      .sort((left, right) => sortRows(left, right, "publishedAt", -1))
      .map((mission) => this.hydratedMission(mission));
    return page(rows, limit);
  }

  async listOwned({ creatorId, status, limit, cursor }) {
    const rows = [...this.missions.values()]
      .filter(
        (mission) =>
          mission.creatorId === String(creatorId) &&
          (!status || mission.status === status) &&
          afterCursor(mission, cursor, "updatedAt", -1),
      )
      .sort((left, right) => sortRows(left, right, "updatedAt", -1));
    return page(rows, limit);
  }

  async findViewer(userId) {
    const user = this.userRepository.users.get(String(userId));
    return user?.accountStatus === "active" ? user : null;
  }

  async listMatches({ viewerId, skills, location, limit, cursor }) {
    const rows = [...this.missions.values()]
      .filter((mission) => {
        const owner = this.userRepository.users.get(String(mission.creatorId));
        const available = openResources(mission.requiredResources);
        const missionSkills = available.flatMap(
          (resource) => resource.requiredSkills,
        );
        const skillMatch = skills.some((skill) =>
          missionSkills.includes(skill),
        );
        const locationMatch =
          location.province &&
          mission.publicLocation.province.toLocaleLowerCase("en") ===
            location.province.toLocaleLowerCase("en");
        return (
          mission.creatorId !== String(viewerId) &&
          ["published", "in_progress"].includes(mission.status) &&
          mission.verificationStatus === "verified" &&
          owner?.accountStatus === "active" &&
          available.length > 0 &&
          (skillMatch || locationMatch) &&
          afterCursor(mission, cursor, "publishedAt", 1)
        );
      })
      .sort((left, right) => sortRows(left, right, "publishedAt", 1))
      .map((mission) => {
        const missionSkills = new Set(
          openResources(mission.requiredResources).flatMap(
            (resource) => resource.requiredSkills,
          ),
        );
        const matchedSkills = skills.filter((skill) =>
          missionSkills.has(skill),
        );
        const sameProvince =
          location.province &&
          mission.publicLocation.province.toLocaleLowerCase("en") ===
            location.province.toLocaleLowerCase("en");
        const sameCity =
          sameProvince &&
          location.city &&
          mission.publicLocation.city.toLocaleLowerCase("en") ===
            location.city.toLocaleLowerCase("en");
        return {
          ...this.hydratedMission(mission),
          match: {
            matchedSkills,
            locationLevel: sameCity
              ? "same_city"
              : sameProvince
                ? "same_province"
                : "not_nearby",
            reasons: [
              ...(matchedSkills.length
                ? [`${matchedSkills.length} saved skill match`]
                : []),
              ...(sameCity
                ? ["Same city"]
                : sameProvince
                  ? ["Same province"]
                  : []),
            ],
          },
        };
      });
    return page(rows, limit);
  }

  async listForModeration({ limit, cursor }) {
    const rows = [...this.missions.values()]
      .filter((mission) => {
        if (mission.status !== "pending_review") return false;
        if (!cursor) return true;
        const submittedAt = new Date(mission.moderation.submittedAt).getTime();
        const cursorAt = cursor.date.getTime();
        return (
          submittedAt > cursorAt ||
          (submittedAt === cursorAt && mission._id > cursor.id)
        );
      })
      .sort((left, right) => {
        const difference =
          new Date(left.moderation.submittedAt).getTime() -
          new Date(right.moderation.submittedAt).getTime();
        return difference || left._id.localeCompare(right._id);
      })
      .map((mission) => this.hydratedMission(mission));
    return page(rows, limit);
  }

  async findForModeration(missionId) {
    const mission = this.missions.get(String(missionId));
    return mission ? this.hydratedMission(mission) : null;
  }

  async moderateAndAudit({
    missionId,
    actorId,
    nextStatus,
    verificationStatus,
    action,
    notes,
    ipHash,
    now,
  }) {
    const mission = this.missions.get(String(missionId));
    if (
      !mission ||
      mission.status !== "pending_review" ||
      mission.creatorId === String(actorId)
    )
      return { mission: null, notification: null };
    Object.assign(mission, {
      status: nextStatus,
      verificationStatus,
      publishedAt: nextStatus === "published" ? now : mission.publishedAt,
      updatedAt: now,
    });
    Object.assign(mission.moderation, {
      reviewerId: String(actorId),
      reviewedAt: now,
      notes,
    });
    this.audits.push({ actorId, action, targetId: missionId, ipHash });
    return {
      mission,
      notification: notification(mission.creatorId, missionId, action),
    };
  }

  activeContributionKey(missionId, resourceId, contributorId) {
    return `${missionId}:${resourceId}:${contributorId}`;
  }

  async createContribution({ missionId, contributorId, input, now }) {
    const mission = this.missions.get(String(missionId));
    if (
      !mission ||
      mission.creatorId === String(contributorId) ||
      !["published", "in_progress"].includes(mission.status) ||
      mission.verificationStatus !== "verified"
    )
      return { outcome: "not_found", contribution: null };
    const contributor = this.userRepository.users.get(String(contributorId));
    const creator = this.userRepository.users.get(String(mission.creatorId));
    if (
      contributor?.accountStatus !== "active" ||
      creator?.accountStatus !== "active"
    )
      return { outcome: "unavailable", contribution: null };
    const resource = mission.requiredResources.find(
      (item) => item._id === String(input.resourceId),
    );
    if (!resource) return { outcome: "resource_mismatch", contribution: null };
    if (
      (resource.type === "item" && input.estimatedMinutes !== undefined) ||
      (resource.type !== "item" && input.estimatedMinutes === undefined)
    )
      return { outcome: "duration_mismatch", contribution: null };
    if (
      input.quantity >
      resource.quantity - resource.reservedQuantity - resource.fulfilledQuantity
    )
      return { outcome: "insufficient", contribution: null };
    const key = this.activeContributionKey(
      missionId,
      input.resourceId,
      contributorId,
    );
    if ([...this.contributions.values()].some((item) => item.activeKey === key))
      return { outcome: "duplicate", contribution: null };
    const contribution = {
      _id: objectId(),
      missionId: mission._id,
      creatorId: mission.creatorId,
      contributorId: String(contributorId),
      resourceId: String(input.resourceId),
      resourceType: resource.type,
      message: input.message,
      quantity: input.quantity,
      estimatedMinutes: input.estimatedMinutes ?? null,
      actualMinutes: null,
      completionNote: null,
      status: "pending",
      activeKey: key,
      acceptedAt: null,
      startedAt: null,
      completionSubmittedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.contributions.set(contribution._id, contribution);
    mission.activityVersion += 1;
    mission.updatedAt = now;
    return {
      outcome: "created",
      contribution: this.hydratedContribution(contribution),
      notification: notification(
        mission.creatorId,
        contribution._id,
        "mission_contribution_received",
      ),
    };
  }

  async findContribution(contributionId) {
    return this.hydratedContribution(
      this.contributions.get(String(contributionId)),
    );
  }

  async listContributions({ participantId, missionId, status, limit, cursor }) {
    const rows = [...this.contributions.values()]
      .filter(
        (item) =>
          (missionId
            ? item.missionId === String(missionId) &&
              item.creatorId === String(participantId)
            : [item.creatorId, item.contributorId].includes(
                String(participantId),
              )) &&
          (!status || item.status === status) &&
          afterCursor(item, cursor, "createdAt", -1),
      )
      .sort((left, right) => sortRows(left, right, "createdAt", -1))
      .map((item) => this.hydratedContribution(item));
    return page(rows, limit);
  }

  async acceptContribution({ contributionId, creatorId, now }) {
    const contribution = this.contributions.get(String(contributionId));
    if (!contribution || contribution.creatorId !== String(creatorId))
      return { outcome: "not_found", contribution: null };
    if (contribution.status === "accepted")
      return {
        outcome: "accepted",
        contribution: this.hydratedContribution(contribution),
      };
    if (contribution.status !== "pending")
      return {
        outcome: "resolved",
        contribution: this.hydratedContribution(contribution),
      };
    const mission = this.missions.get(contribution.missionId);
    const resource = mission?.requiredResources.find(
      (item) => item._id === contribution.resourceId,
    );
    if (!resource) return { outcome: "unavailable", contribution: null };
    if (
      resource.quantity -
        resource.reservedQuantity -
        resource.fulfilledQuantity <
      contribution.quantity
    )
      return { outcome: "insufficient", contribution: null };
    resource.reservedQuantity += contribution.quantity;
    mission.status = "in_progress";
    mission.activityVersion += 1;
    mission.updatedAt = now;
    contribution.status = "accepted";
    contribution.acceptedAt = now;
    contribution.updatedAt = now;
    return {
      outcome: "accepted",
      contribution: this.hydratedContribution(contribution),
      notification: notification(
        contribution.contributorId,
        contribution._id,
        "mission_contribution_accepted",
      ),
    };
  }

  async simpleTransition({
    contributionId,
    actorField,
    actorId,
    from,
    to,
    timestampField,
    notificationKind,
    now,
  }) {
    const contribution = this.contributions.get(String(contributionId));
    if (!contribution || contribution[actorField] !== String(actorId))
      return { outcome: "not_found", contribution: null };
    if (contribution.status === to)
      return {
        outcome: to,
        contribution: this.hydratedContribution(contribution),
      };
    if (contribution.status !== from)
      return {
        outcome: "resolved",
        contribution: this.hydratedContribution(contribution),
      };
    contribution.status = to;
    contribution[timestampField] = now;
    contribution.updatedAt = now;
    if (["rejected", "withdrawn"].includes(to)) delete contribution.activeKey;
    return {
      outcome: to,
      contribution: this.hydratedContribution(contribution),
      notification: notificationKind
        ? notification(
            contribution.contributorId,
            contribution._id,
            notificationKind,
          )
        : null,
    };
  }

  async submitCompletion({ contributionId, contributorId, input, now }) {
    const contribution = this.contributions.get(String(contributionId));
    if (!contribution || contribution.contributorId !== String(contributorId))
      return { outcome: "not_found", contribution: null };
    if (contribution.status === "completion_submitted")
      return {
        outcome: "submitted",
        contribution: this.hydratedContribution(contribution),
      };
    if (contribution.status !== "in_progress")
      return { outcome: "resolved", contribution: null };
    if (
      (contribution.resourceType === "item" &&
        input.actualMinutes !== undefined) ||
      (contribution.resourceType !== "item" &&
        input.actualMinutes === undefined)
    )
      return { outcome: "duration_mismatch", contribution: null };
    Object.assign(contribution, {
      status: "completion_submitted",
      completionNote: input.note,
      actualMinutes: input.actualMinutes ?? null,
      completionSubmittedAt: now,
      updatedAt: now,
    });
    return {
      outcome: "submitted",
      contribution: this.hydratedContribution(contribution),
      notification: notification(
        contribution.creatorId,
        contribution._id,
        "mission_completion_submitted",
      ),
    };
  }

  async confirmCompletion({ contributionId, creatorId, now }) {
    const contribution = this.contributions.get(String(contributionId));
    if (!contribution || contribution.creatorId !== String(creatorId))
      return { outcome: "not_found", contribution: null };
    if (contribution.status === "completed")
      return {
        outcome: "completed",
        contribution: this.hydratedContribution(contribution),
      };
    if (contribution.status !== "completion_submitted")
      return { outcome: "resolved", contribution: null };
    const mission = this.missions.get(contribution.missionId);
    const resource = mission?.requiredResources.find(
      (item) => item._id === contribution.resourceId,
    );
    if (!resource || resource.reservedQuantity < contribution.quantity)
      return { outcome: "insufficient", contribution: null };
    resource.reservedQuantity -= contribution.quantity;
    resource.fulfilledQuantity += contribution.quantity;
    contribution.status = "completed";
    contribution.completedAt = now;
    contribution.updatedAt = now;
    delete contribution.activeKey;
    const completed = mission.requiredResources.every(
      (item) => item.fulfilledQuantity >= item.quantity,
    );
    mission.status = completed ? "completed" : "in_progress";
    mission.completedAt = completed ? now : null;
    mission.updatedAt = now;
    return {
      outcome: "completed",
      contribution: this.hydratedContribution(contribution),
      notification: notification(
        contribution.contributorId,
        contribution._id,
        completed ? "mission_completed" : "mission_contribution_completed",
      ),
    };
  }

  async cancelMission(missionId, creatorId, now) {
    const mission = await this.findOwned(missionId, creatorId);
    if (
      !mission ||
      ![
        "draft",
        "changes_requested",
        "pending_review",
        "published",
        "in_progress",
      ].includes(mission.status)
    )
      return { mission: null, notifications: [] };
    const active = [...this.contributions.values()].filter(
      (item) =>
        item.missionId === mission._id &&
        ["pending", "accepted", "in_progress", "completion_submitted"].includes(
          item.status,
        ),
    );
    if (active.some((item) => item.status === "completion_submitted"))
      return { mission: null, notifications: [] };
    const contributorIds = [
      ...new Set(active.map((contribution) => contribution.contributorId)),
    ];
    for (const contribution of active) {
      if (["accepted", "in_progress"].includes(contribution.status)) {
        const resource = mission.requiredResources.find(
          (item) => item._id === contribution.resourceId,
        );
        resource.reservedQuantity -= contribution.quantity;
      }
      contribution.status = "cancelled";
      contribution.cancelledAt = now;
      contribution.updatedAt = now;
      delete contribution.activeKey;
    }
    mission.status = "cancelled";
    mission.cancelledAt = now;
    mission.updatedAt = now;
    return {
      mission,
      notifications: contributorIds.map((recipientId) =>
        notification(recipientId, mission._id, "mission_cancelled"),
      ),
    };
  }
}
