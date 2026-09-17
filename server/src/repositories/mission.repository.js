import mongoose from "mongoose";

import { AuditLog } from "../models/AuditLog.js";
import { CommunityMission } from "../models/CommunityMission.js";
import { IdempotencyRecord } from "../models/IdempotencyRecord.js";
import { MissionContribution } from "../models/MissionContribution.js";
import { User } from "../models/User.js";
import { UserBlock } from "../models/UserBlock.js";
import { createNotification } from "./notificationWrites.js";

const visibleMissionStatuses = ["published", "in_progress", "completed"];
const activeMissionStatuses = ["published", "in_progress"];
const activeContributionStatuses = [
  "pending",
  "accepted",
  "in_progress",
  "completion_submitted",
];
const personFields = "firstName lastName verification accountStatus";

class TransitionAbort extends Error {
  constructor(outcome) {
    super(outcome);
    this.outcome = outcome;
  }
}

function cursorClause(cursor, field, direction = -1) {
  if (!cursor) return {};
  const comparison = direction === 1 ? "$gt" : "$lt";
  return {
    $or: [
      { [field]: { [comparison]: cursor.date } },
      { [field]: cursor.date, _id: { [comparison]: cursor.id } },
    ],
  };
}

function activeKey(missionId, resourceId, contributorId) {
  return `${missionId}:${resourceId}:${contributorId}`;
}

function allResourcesFulfilled(resources) {
  return resources.every(
    (resource) => (resource.fulfilledQuantity ?? 0) >= (resource.quantity ?? 0),
  );
}

function openResources(resources) {
  return resources.filter(
    (resource) =>
      (resource.quantity ?? 0) >
      (resource.reservedQuantity ?? 0) + (resource.fulfilledQuantity ?? 0),
  );
}

async function blocked(leftId, rightId, session) {
  return Boolean(
    await UserBlock.exists({
      $or: [
        { blockerId: leftId, blockedId: rightId },
        { blockerId: rightId, blockedId: leftId },
      ],
    }).session(session),
  );
}

async function participantsAvailable(leftId, rightId, session) {
  const count = await User.countDocuments({
    _id: { $in: [leftId, rightId] },
    accountStatus: "active",
  }).session(session);
  return count === 2 && !(await blocked(leftId, rightId, session));
}

function missionPopulate(query) {
  return query.populate({ path: "creatorId", select: personFields });
}

function contributionPopulate(query) {
  return query
    .populate({ path: "creatorId", select: personFields })
    .populate({ path: "contributorId", select: personFields })
    .populate({
      path: "missionId",
      select: "title status publicLocation requiredResources",
    });
}

export class MissionRepository {
  async claimIdempotency({
    principalId,
    operation,
    keyHash,
    requestHash,
    now,
    expiresAt,
  }) {
    const scope = { principalId, operation, keyHash };
    const existing = await IdempotencyRecord.findOne(scope)
      .select("+keyHash +requestHash +responseBody")
      .lean()
      .exec();
    if (existing && existing.expiresAt > now) {
      if (existing.requestHash !== requestHash) return { outcome: "mismatch" };
      if (existing.state === "completed")
        return { outcome: "replay", responseBody: existing.responseBody };
      return { outcome: "in_progress" };
    }
    if (existing) await IdempotencyRecord.deleteOne({ _id: existing._id });
    try {
      await IdempotencyRecord.create({
        ...scope,
        requestHash,
        state: "in_progress",
        expiresAt,
      });
      return { outcome: "claimed" };
    } catch (error) {
      if (error?.code !== 11000) throw error;
      return { outcome: "in_progress" };
    }
  }

  completeIdempotency(input) {
    return IdempotencyRecord.findOneAndUpdate(
      {
        principalId: input.principalId,
        operation: input.operation,
        keyHash: input.keyHash,
        requestHash: input.requestHash,
        state: "in_progress",
      },
      {
        $set: {
          state: "completed",
          responseStatus: input.responseStatus,
          responseBody: input.responseBody,
          updatedAt: input.now,
        },
      },
      { new: true },
    )
      .lean()
      .exec();
  }

  releaseIdempotency(input) {
    return IdempotencyRecord.deleteOne({
      principalId: input.principalId,
      operation: input.operation,
      keyHash: input.keyHash,
      requestHash: input.requestHash,
      state: "in_progress",
    });
  }

  async createMission(creatorId, input, now) {
    const mission = await CommunityMission.create({
      creatorId,
      title: input.title,
      description: input.description,
      category: input.category,
      location: {
        country: input.location.country ?? "Philippines",
        province: input.location.province,
        city: input.location.city,
        barangay: input.location.barangay ?? null,
      },
      publicLocation: {
        province: input.location.province,
        city: input.location.city,
      },
      requiredResources: input.requiredResources,
      evidence: { note: input.evidenceNote },
      createdAt: now,
      updatedAt: now,
    });
    return mission.toObject();
  }

  findOwned(missionId, creatorId) {
    return CommunityMission.findOne({ _id: missionId, creatorId })
      .select("+evidence.note")
      .lean()
      .exec();
  }

  async findPublic(missionId) {
    const mission = await missionPopulate(
      CommunityMission.findOne({
        _id: missionId,
        status: { $in: visibleMissionStatuses },
        verificationStatus: "verified",
      }),
    )
      .lean()
      .exec();
    return mission?.creatorId?.accountStatus === "active" ? mission : null;
  }

  updateOwned(missionId, creatorId, patch, now) {
    const update = { ...patch, updatedAt: now };
    if (patch.evidenceNote !== undefined) {
      update["evidence.note"] = patch.evidenceNote;
      delete update.evidenceNote;
    }
    if (patch.location) {
      update.publicLocation = {
        province: patch.location.province,
        city: patch.location.city,
      };
    }
    return CommunityMission.findOneAndUpdate(
      {
        _id: missionId,
        creatorId,
        status: { $in: ["draft", "changes_requested"] },
      },
      { $set: update },
      { new: true, runValidators: true },
    )
      .select("+evidence.note")
      .lean()
      .exec();
  }

  submitOwned(missionId, creatorId, safetyFlags, now) {
    return CommunityMission.findOneAndUpdate(
      {
        _id: missionId,
        creatorId,
        status: { $in: ["draft", "changes_requested"] },
      },
      {
        $set: {
          status: "pending_review",
          verificationStatus: "pending",
          safetyFlags,
          "moderation.submittedAt": now,
          "moderation.reviewerId": null,
          "moderation.reviewedAt": null,
          "moderation.notes": null,
          updatedAt: now,
        },
      },
      { new: true, runValidators: true },
    )
      .select("+evidence.note")
      .lean()
      .exec();
  }

  async listPublic({ category, resourceType, province, city, limit, cursor }) {
    const filter = {
      status: { $in: visibleMissionStatuses },
      verificationStatus: "verified",
      ...(category ? { category } : {}),
      ...(resourceType ? { "requiredResources.type": resourceType } : {}),
      ...(province
        ? {
            "publicLocation.province": new RegExp(
              `^${province.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
              "i",
            ),
          }
        : {}),
      ...(city
        ? {
            "publicLocation.city": new RegExp(
              `^${city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
              "i",
            ),
          }
        : {}),
      ...cursorClause(cursor, "publishedAt"),
    };
    const rows = await missionPopulate(
      CommunityMission.find(filter)
        .sort({ publishedAt: -1, _id: -1 })
        .limit(limit + 1),
    )
      .lean()
      .exec();
    const eligible = rows.filter(
      (mission) => mission.creatorId?.accountStatus === "active",
    );
    return {
      items: eligible.slice(0, limit),
      hasNextPage: eligible.length > limit,
    };
  }

  async listOwned({ creatorId, status, limit, cursor }) {
    const rows = await CommunityMission.find({
      creatorId,
      ...(status ? { status } : {}),
      ...cursorClause(cursor, "updatedAt"),
    })
      .select("+evidence.note")
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean()
      .exec();
    return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
  }

  async listMatches({ viewerId, skills, location, limit, cursor }) {
    const relationships = await UserBlock.find({
      $or: [{ blockerId: viewerId }, { blockedId: viewerId }],
    })
      .select("blockerId blockedId")
      .lean()
      .exec();
    const blockedIds = relationships.map((item) =>
      String(item.blockerId) === String(viewerId)
        ? item.blockedId
        : item.blockerId,
    );
    const matchClauses = [];
    if (skills.length)
      matchClauses.push({
        "requiredResources.requiredSkills": { $in: skills },
      });
    if (location.province)
      matchClauses.push({
        "publicLocation.province": new RegExp(
          `^${location.province.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`,
          "i",
        ),
      });
    if (!matchClauses.length) return { items: [], hasNextPage: false };
    const rows = await missionPopulate(
      CommunityMission.find({
        creatorId: { $nin: [viewerId, ...blockedIds] },
        status: { $in: activeMissionStatuses },
        verificationStatus: "verified",
        $or: matchClauses,
        ...cursorClause(cursor, "publishedAt", 1),
      })
        .sort({ publishedAt: 1, _id: 1 })
        .limit(limit + 1),
    )
      .lean()
      .exec();
    const eligible = rows
      .filter((mission) => {
        if (mission.creatorId?.accountStatus !== "active") return false;
        const available = openResources(mission.requiredResources);
        const hasSkillMatch = available.some((resource) =>
          (resource.requiredSkills ?? []).some((skill) =>
            skills.includes(skill),
          ),
        );
        const hasLocationMatch =
          location.province &&
          mission.publicLocation?.province?.toLocaleLowerCase("en") ===
            location.province.toLocaleLowerCase("en") &&
          available.length > 0;
        return hasSkillMatch || hasLocationMatch;
      })
      .map((mission) => {
        const missionSkills = new Set(
          openResources(mission.requiredResources).flatMap(
            (item) => item.requiredSkills ?? [],
          ),
        );
        const matchedSkills = skills.filter((skill) =>
          missionSkills.has(skill),
        );
        const sameProvince =
          location.province &&
          mission.publicLocation?.province?.toLocaleLowerCase("en") ===
            location.province.toLocaleLowerCase("en");
        const sameCity =
          sameProvince &&
          location.city &&
          mission.publicLocation?.city?.toLocaleLowerCase("en") ===
            location.city.toLocaleLowerCase("en");
        const reasons = [];
        if (matchedSkills.length)
          reasons.push(`${matchedSkills.length} saved skill match`);
        if (sameCity) reasons.push("Same city");
        else if (sameProvince) reasons.push("Same province");
        return {
          ...mission,
          match: {
            matchedSkills,
            locationLevel: sameCity
              ? "same_city"
              : sameProvince
                ? "same_province"
                : "not_nearby",
            reasons,
          },
        };
      });
    return {
      items: eligible.slice(0, limit),
      hasNextPage: eligible.length > limit,
    };
  }

  findViewer(userId) {
    return User.findOne({ _id: userId, accountStatus: "active" })
      .select("skills location")
      .lean()
      .exec();
  }

  async listForModeration({ limit, cursor }) {
    const rows = await missionPopulate(
      CommunityMission.find({
        status: "pending_review",
        ...cursorClause(cursor, "moderation.submittedAt", 1),
      })
        .select("+evidence.note +safetyFlags")
        .sort({ "moderation.submittedAt": 1, _id: 1 })
        .limit(limit + 1),
    )
      .lean()
      .exec();
    return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
  }

  async findForModeration(missionId) {
    return missionPopulate(
      CommunityMission.findById(missionId).select(
        "+evidence.note +safetyFlags",
      ),
    )
      .lean()
      .exec();
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
    let updated = null;
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        const mission = await CommunityMission.findOne({
          _id: missionId,
          status: "pending_review",
        })
          .session(session)
          .lean()
          .exec();
        if (!mission || String(mission.creatorId) === String(actorId)) return;
        const owner = await User.findOne({
          _id: mission.creatorId,
          accountStatus: "active",
        })
          .session(session)
          .lean()
          .exec();
        if (!owner) return;
        updated = await CommunityMission.findOneAndUpdate(
          { _id: missionId, status: "pending_review" },
          {
            $set: {
              status: nextStatus,
              verificationStatus,
              "moderation.reviewerId": actorId,
              "moderation.reviewedAt": now,
              "moderation.notes": notes,
              ...(nextStatus === "published" ? { publishedAt: now } : {}),
              updatedAt: now,
            },
          },
          { new: true, session, runValidators: true },
        )
          .select("+evidence.note +safetyFlags")
          .lean()
          .exec();
        if (!updated) throw new TransitionAbort("state_changed");
        await AuditLog.create(
          [
            {
              actorId,
              action,
              targetType: "community_mission",
              targetId: missionId,
              metadata: { nextStatus, verificationStatus },
              ipHash,
              createdAt: now,
            },
          ],
          { session },
        );
        notification = await createNotification({
          recipientId: mission.creatorId,
          kind: action,
          resourceType: "community_mission",
          resourceId: missionId,
          now,
          session,
        });
      });
    } catch (error) {
      if (!(error instanceof TransitionAbort)) throw error;
      updated = null;
      notification = null;
    }
    return { mission: updated, notification };
  }

  async createContribution({ missionId, contributorId, input, now }) {
    let outcome = "not_found";
    let created = null;
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        const mission = await CommunityMission.findOne({
          _id: missionId,
          status: { $in: activeMissionStatuses },
          verificationStatus: "verified",
        })
          .session(session)
          .lean()
          .exec();
        if (!mission || String(mission.creatorId) === String(contributorId))
          return;
        if (
          !(await participantsAvailable(
            mission.creatorId,
            contributorId,
            session,
          ))
        ) {
          outcome = "unavailable";
          return;
        }
        const resource = mission.requiredResources.find(
          (item) => String(item._id) === String(input.resourceId),
        );
        if (!resource) {
          outcome = "resource_mismatch";
          return;
        }
        if (
          (resource.type === "item" && input.estimatedMinutes !== undefined) ||
          (resource.type !== "item" && input.estimatedMinutes === undefined)
        ) {
          outcome = "duration_mismatch";
          return;
        }
        if (
          input.quantity >
          resource.quantity -
            (resource.reservedQuantity ?? 0) -
            (resource.fulfilledQuantity ?? 0)
        ) {
          outcome = "insufficient";
          return;
        }
        const key = activeKey(missionId, input.resourceId, contributorId);
        if (
          await MissionContribution.exists({ activeKey: key }).session(session)
        ) {
          outcome = "duplicate";
          return;
        }
        const [contribution] = await MissionContribution.create(
          [
            {
              missionId,
              creatorId: mission.creatorId,
              contributorId,
              resourceId: input.resourceId,
              resourceType: resource.type,
              message: input.message,
              quantity: input.quantity,
              estimatedMinutes: input.estimatedMinutes ?? null,
              activeKey: key,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { session },
        );
        created = contribution.toObject();
        await CommunityMission.updateOne(
          { _id: missionId },
          { $inc: { activityVersion: 1 }, $set: { updatedAt: now } },
          { session },
        );
        notification = await createNotification({
          recipientId: mission.creatorId,
          kind: "mission_contribution_received",
          resourceType: "mission_contribution",
          resourceId: created._id,
          now,
          session,
        });
        outcome = "created";
      });
    } catch (error) {
      if (error?.code === 11000) outcome = "duplicate";
      else throw error;
    }
    return {
      outcome,
      contribution: created ? await this.findContribution(created._id) : null,
      notification,
    };
  }

  findContribution(contributionId) {
    return contributionPopulate(MissionContribution.findById(contributionId))
      .lean()
      .exec();
  }

  async listContributions({ participantId, missionId, status, limit, cursor }) {
    const filter = {
      ...(missionId
        ? { missionId, creatorId: participantId }
        : {
            $or: [
              { creatorId: participantId },
              { contributorId: participantId },
            ],
          }),
      ...(status ? { status } : {}),
      ...cursorClause(cursor, "createdAt"),
    };
    const rows = await contributionPopulate(
      MissionContribution.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1),
    )
      .lean()
      .exec();
    return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
  }

  async acceptContribution({ contributionId, creatorId, now }) {
    let outcome = "not_found";
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        const contribution = await MissionContribution.findOne({
          _id: contributionId,
          creatorId,
        })
          .select("+activeKey")
          .session(session)
          .lean()
          .exec();
        if (!contribution) return;
        if (contribution.status === "accepted") {
          outcome = "accepted";
          return;
        }
        if (contribution.status !== "pending") {
          outcome = "resolved";
          return;
        }
        if (
          !(await participantsAvailable(
            creatorId,
            contribution.contributorId,
            session,
          ))
        ) {
          outcome = "unavailable";
          return;
        }
        const mission = await CommunityMission.findOne({
          _id: contribution.missionId,
          creatorId,
          status: { $in: activeMissionStatuses },
          verificationStatus: "verified",
        })
          .select("+activityVersion")
          .session(session)
          .lean()
          .exec();
        const resource = mission?.requiredResources.find(
          (item) => String(item._id) === String(contribution.resourceId),
        );
        if (!resource) {
          outcome = "unavailable";
          return;
        }
        const remaining =
          resource.quantity -
          (resource.reservedQuantity ?? 0) -
          (resource.fulfilledQuantity ?? 0);
        if (remaining < contribution.quantity) {
          outcome = "insufficient";
          return;
        }
        const updatedMission = await CommunityMission.findOneAndUpdate(
          {
            _id: mission._id,
            activityVersion: mission.activityVersion,
            "requiredResources._id": contribution.resourceId,
            "requiredResources.reservedQuantity": resource.reservedQuantity,
            "requiredResources.fulfilledQuantity": resource.fulfilledQuantity,
          },
          {
            $inc: {
              "requiredResources.$.reservedQuantity": contribution.quantity,
              activityVersion: 1,
            },
            $set: { status: "in_progress", updatedAt: now },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedMission) throw new TransitionAbort("state_changed");
        const updatedContribution = await MissionContribution.findOneAndUpdate(
          { _id: contributionId, status: "pending" },
          { $set: { status: "accepted", acceptedAt: now, updatedAt: now } },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedContribution) throw new TransitionAbort("state_changed");
        notification = await createNotification({
          recipientId: contribution.contributorId,
          kind: "mission_contribution_accepted",
          resourceType: "mission_contribution",
          resourceId: contributionId,
          now,
          session,
        });
        outcome = "accepted";
      });
    } catch (error) {
      if (error instanceof TransitionAbort) outcome = error.outcome;
      else throw error;
    }
    return {
      outcome,
      contribution: await this.findContribution(contributionId),
      notification,
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
    const existing = await MissionContribution.findOne({
      _id: contributionId,
      [actorField]: actorId,
    })
      .lean()
      .exec();
    if (!existing) return { outcome: "not_found", contribution: null };
    if (existing.status === to)
      return {
        outcome: to,
        contribution: await this.findContribution(contributionId),
      };
    if (existing.status !== from)
      return {
        outcome: "resolved",
        contribution: await this.findContribution(contributionId),
      };
    if (to === "in_progress") {
      const mission = await CommunityMission.findOne({
        _id: existing.missionId,
        creatorId: existing.creatorId,
        status: { $in: activeMissionStatuses },
        verificationStatus: "verified",
      })
        .select("_id")
        .lean()
        .exec();
      if (
        !mission ||
        !(await participantsAvailable(
          existing.creatorId,
          existing.contributorId,
        ))
      )
        return { outcome: "unavailable", contribution: null };
    }
    const updated = await MissionContribution.findOneAndUpdate(
      { _id: contributionId, [actorField]: actorId, status: from },
      {
        $set: { status: to, [timestampField]: now, updatedAt: now },
        ...(["rejected", "withdrawn"].includes(to)
          ? { $unset: { activeKey: 1 } }
          : {}),
      },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (!updated) return { outcome: "state_changed", contribution: null };
    const recipientId =
      actorField === "creatorId" ? existing.contributorId : existing.creatorId;
    let notification = null;
    if (notificationKind) {
      notification = await createNotification({
        recipientId,
        kind: notificationKind,
        resourceType: "mission_contribution",
        resourceId: contributionId,
        now,
      });
    }
    return {
      outcome: to,
      contribution: await this.findContribution(contributionId),
      notification,
    };
  }

  async submitCompletion({ contributionId, contributorId, input, now }) {
    const existing = await MissionContribution.findOne({
      _id: contributionId,
      contributorId,
    })
      .lean()
      .exec();
    if (!existing) return { outcome: "not_found", contribution: null };
    if (existing.status === "completion_submitted")
      return {
        outcome: "submitted",
        contribution: await this.findContribution(contributionId),
      };
    if (existing.status !== "in_progress")
      return {
        outcome: "resolved",
        contribution: await this.findContribution(contributionId),
      };
    const mission = await CommunityMission.findOne({
      _id: existing.missionId,
      creatorId: existing.creatorId,
      status: "in_progress",
      verificationStatus: "verified",
    })
      .select("_id")
      .lean()
      .exec();
    if (
      !mission ||
      !(await participantsAvailable(existing.creatorId, existing.contributorId))
    )
      return { outcome: "unavailable", contribution: null };
    if (
      (existing.resourceType === "item" && input.actualMinutes !== undefined) ||
      (existing.resourceType !== "item" && input.actualMinutes === undefined)
    )
      return { outcome: "duration_mismatch", contribution: null };
    const updated = await MissionContribution.findOneAndUpdate(
      { _id: contributionId, contributorId, status: "in_progress" },
      {
        $set: {
          status: "completion_submitted",
          completionNote: input.note,
          actualMinutes: input.actualMinutes ?? null,
          completionSubmittedAt: now,
          updatedAt: now,
        },
      },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    if (!updated) return { outcome: "state_changed", contribution: null };
    const notification = await createNotification({
      recipientId: existing.creatorId,
      kind: "mission_completion_submitted",
      resourceType: "mission_contribution",
      resourceId: contributionId,
      now,
    });
    return {
      outcome: "submitted",
      contribution: await this.findContribution(contributionId),
      notification,
    };
  }

  async confirmCompletion({ contributionId, creatorId, now }) {
    let outcome = "not_found";
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        const contribution = await MissionContribution.findOne({
          _id: contributionId,
          creatorId,
        })
          .session(session)
          .lean()
          .exec();
        if (!contribution) return;
        if (contribution.status === "completed") {
          outcome = "completed";
          return;
        }
        if (contribution.status !== "completion_submitted") {
          outcome = "resolved";
          return;
        }
        if (
          !(await participantsAvailable(
            creatorId,
            contribution.contributorId,
            session,
          ))
        ) {
          outcome = "unavailable";
          return;
        }
        const mission = await CommunityMission.findOne({
          _id: contribution.missionId,
          creatorId,
          status: "in_progress",
          verificationStatus: "verified",
        })
          .select("+activityVersion")
          .session(session)
          .lean()
          .exec();
        const resource = mission?.requiredResources.find(
          (item) => String(item._id) === String(contribution.resourceId),
        );
        if (
          !resource ||
          resource.reservedQuantity < contribution.quantity ||
          resource.fulfilledQuantity + contribution.quantity > resource.quantity
        ) {
          outcome = "insufficient";
          return;
        }
        const nextResources = mission.requiredResources.map((item) =>
          String(item._id) === String(resource._id)
            ? {
                ...item,
                reservedQuantity: item.reservedQuantity - contribution.quantity,
                fulfilledQuantity:
                  item.fulfilledQuantity + contribution.quantity,
              }
            : item,
        );
        const missionCompleted = allResourcesFulfilled(nextResources);
        const updatedMission = await CommunityMission.findOneAndUpdate(
          {
            _id: mission._id,
            activityVersion: mission.activityVersion,
            "requiredResources._id": contribution.resourceId,
            "requiredResources.reservedQuantity": resource.reservedQuantity,
            "requiredResources.fulfilledQuantity": resource.fulfilledQuantity,
          },
          {
            $inc: {
              "requiredResources.$.reservedQuantity": -contribution.quantity,
              "requiredResources.$.fulfilledQuantity": contribution.quantity,
              activityVersion: 1,
            },
            $set: {
              status: missionCompleted ? "completed" : "in_progress",
              completedAt: missionCompleted ? now : null,
              updatedAt: now,
            },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedMission) throw new TransitionAbort("state_changed");
        const updated = await MissionContribution.findOneAndUpdate(
          { _id: contributionId, status: "completion_submitted" },
          {
            $set: { status: "completed", completedAt: now, updatedAt: now },
            $unset: { activeKey: 1 },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updated) throw new TransitionAbort("state_changed");
        notification = await createNotification({
          recipientId: contribution.contributorId,
          kind: missionCompleted
            ? "mission_completed"
            : "mission_contribution_completed",
          resourceType: "mission_contribution",
          resourceId: contributionId,
          eventId: `${contributionId}:${missionCompleted ? "mission" : "resource"}`,
          now,
          session,
        });
        outcome = "completed";
      });
    } catch (error) {
      if (error instanceof TransitionAbort) outcome = error.outcome;
      else throw error;
    }
    return {
      outcome,
      contribution: await this.findContribution(contributionId),
      notification,
    };
  }

  async cancelMission(missionId, creatorId, now) {
    let updated = null;
    let notifications = [];
    try {
      await mongoose.connection.transaction(async (session) => {
        const mission = await CommunityMission.findOne({
          _id: missionId,
          creatorId,
          status: {
            $in: [
              "draft",
              "changes_requested",
              "pending_review",
              "published",
              "in_progress",
            ],
          },
        })
          .session(session)
          .exec();
        if (!mission) return;
        const contributions = await MissionContribution.find({
          missionId,
          status: { $in: activeContributionStatuses },
        })
          .select("+activeKey")
          .session(session)
          .lean()
          .exec();
        if (
          contributions.some((item) => item.status === "completion_submitted")
        )
          return;
        for (const contribution of contributions) {
          if (["accepted", "in_progress"].includes(contribution.status)) {
            const resource = mission.requiredResources.id(
              contribution.resourceId,
            );
            if (!resource || resource.reservedQuantity < contribution.quantity)
              throw new TransitionAbort("state_changed");
            resource.reservedQuantity -= contribution.quantity;
          }
        }
        mission.status = "cancelled";
        mission.cancelledAt = now;
        mission.updatedAt = now;
        await mission.save({ session });
        await MissionContribution.updateMany(
          { missionId, status: { $in: activeContributionStatuses } },
          {
            $set: { status: "cancelled", cancelledAt: now, updatedAt: now },
            $unset: { activeKey: 1 },
          },
          { session, runValidators: true },
        );
        const contributorIds = [
          ...new Set(
            contributions.map((contribution) =>
              String(contribution.contributorId),
            ),
          ),
        ];
        notifications = await Promise.all(
          contributorIds.map((recipientId) =>
            createNotification({
              recipientId,
              kind: "mission_cancelled",
              resourceType: "community_mission",
              resourceId: missionId,
              eventId: missionId,
              now,
              session,
            }),
          ),
        );
        updated = mission.toObject();
      });
    } catch (error) {
      if (!(error instanceof TransitionAbort)) throw error;
      updated = null;
      notifications = [];
    }
    return { mission: updated, notifications };
  }
}
