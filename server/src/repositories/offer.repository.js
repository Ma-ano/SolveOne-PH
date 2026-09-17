import mongoose from "mongoose";

import { AuditLog } from "../models/AuditLog.js";
import { Conversation } from "../models/Conversation.js";
import { CompletionEvidence } from "../models/CompletionEvidence.js";
import { EvidenceStorageRepository } from "./evidenceStorage.repository.js";
import { createNotification } from "./notificationWrites.js";
import { HelpOffer } from "../models/HelpOffer.js";
import { HelpRequest } from "../models/HelpRequest.js";
import { IdempotencyRecord } from "../models/IdempotencyRecord.js";
import { User } from "../models/User.js";
import { UserBlock } from "../models/UserBlock.js";
import {
  requestHasConfirmedProgress,
  requestIsFullySolved,
} from "../utils/requestProgress.js";

const openRequestStatuses = ["published", "partially_solved"];

function publicPersonPopulation(path) {
  return {
    path,
    select: "firstName lastName verification.level accountStatus",
  };
}

function requestPopulation() {
  return {
    path: "requestId",
    select: "title status ownerId needItems publicLocation",
    populate: publicPersonPopulation("ownerId"),
  };
}

function withCursor(filter, cursor) {
  if (!cursor) {
    return filter;
  }
  return {
    ...filter,
    $or: [
      { createdAt: { $lt: cursor.date } },
      { createdAt: cursor.date, _id: { $lt: cursor.id } },
    ],
  };
}

async function runPage(query, limit) {
  const rows = await query
    .limit(limit + 1)
    .lean()
    .exec();
  return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
}

class TransitionAbort extends Error {
  constructor(outcome) {
    super(outcome);
    this.outcome = outcome;
  }
}

function reservationFor(offer) {
  return offer.helpType === "money"
    ? {
        field: "reservedValueCentavos",
        solvedField: "solvedValueCentavos",
        totalField: "estimatedValueCentavos",
        amount: offer.pledgedValueCentavos,
      }
    : {
        field: "reservedQuantity",
        solvedField: "solvedQuantity",
        totalField: "quantity",
        amount: offer.quantity,
      };
}

function counterCondition(value) {
  return value === undefined || value === null ? { $in: [0, null] } : value;
}

async function participantsAvailable(request, helperId, session) {
  const [requester, helper, blocked] = await Promise.all([
    User.findOne({ _id: request.ownerId, accountStatus: "active" })
      .session(session)
      .select("_id")
      .lean()
      .exec(),
    User.findOne({ _id: helperId, accountStatus: "active" })
      .session(session)
      .select("_id")
      .lean()
      .exec(),
    UserBlock.exists({
      $or: [
        { blockerId: request.ownerId, blockedId: helperId },
        { blockerId: helperId, blockedId: request.ownerId },
      ],
    }).session(session),
  ]);
  return Boolean(requester && helper && !blocked);
}

async function ensureConversation(request, offer, now, session) {
  const participants = [request.ownerId, offer.helperId];
  await Conversation.findOneAndUpdate(
    { offerId: offer._id },
    {
      $setOnInsert: {
        participants,
        requestId: request._id,
        offerId: offer._id,
        status: "active",
        readStates: participants.map((userId) => ({ userId })),
        lastMessageAt: now,
        createdAt: now,
        updatedAt: now,
      },
    },
    { upsert: true, new: true, session, runValidators: true },
  );
}

export class OfferRepository {
  constructor({ evidenceStorage = new EvidenceStorageRepository() } = {}) {
    this.evidenceStorage = evidenceStorage;
  }

  async claimIdempotency({
    principalId,
    operation,
    keyHash,
    requestHash,
    expiresAt,
    now,
  }) {
    try {
      await IdempotencyRecord.create({
        principalId,
        operation,
        keyHash,
        requestHash,
        state: "in_progress",
        expiresAt,
        createdAt: now,
        updatedAt: now,
      });
      return { outcome: "claimed" };
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
    }

    let existing = await IdempotencyRecord.findOne({
      principalId,
      operation,
      keyHash,
    })
      .select("+keyHash +requestHash +responseBody")
      .lean()
      .exec();
    if (existing && new Date(existing.expiresAt) <= now) {
      await IdempotencyRecord.deleteOne({
        _id: existing._id,
        state: existing.state,
        expiresAt: existing.expiresAt,
      });
      existing = null;
      return this.claimIdempotency({
        principalId,
        operation,
        keyHash,
        requestHash,
        expiresAt,
        now,
      });
    }
    if (!existing) {
      return { outcome: "in_progress" };
    }
    if (existing.requestHash !== requestHash) {
      return { outcome: "mismatch" };
    }
    if (existing.state === "completed") {
      return {
        outcome: "replay",
        responseStatus: existing.responseStatus,
        responseBody: existing.responseBody,
      };
    }
    return { outcome: "in_progress" };
  }

  async completeIdempotency({
    principalId,
    operation,
    keyHash,
    requestHash,
    responseStatus,
    responseBody,
    now,
  }) {
    return IdempotencyRecord.findOneAndUpdate(
      {
        principalId,
        operation,
        keyHash,
        requestHash,
        state: "in_progress",
      },
      {
        $set: {
          state: "completed",
          responseStatus,
          responseBody,
          updatedAt: now,
        },
      },
      { new: true, runValidators: true },
    )
      .select("_id")
      .lean()
      .exec();
  }

  async releaseIdempotency({ principalId, operation, keyHash, requestHash }) {
    await IdempotencyRecord.deleteOne({
      principalId,
      operation,
      keyHash,
      requestHash,
      state: "in_progress",
    });
  }

  async findOpenRequest(requestId) {
    return HelpRequest.findOne({
      _id: requestId,
      status: { $in: openRequestStatuses },
      visibility: "public",
    })
      .populate(publicPersonPopulation("ownerId"))
      .lean()
      .exec();
  }

  async isBlocked(leftUserId, rightUserId) {
    return Boolean(
      await UserBlock.exists({
        $or: [
          { blockerId: leftUserId, blockedId: rightUserId },
          { blockerId: rightUserId, blockedId: leftUserId },
        ],
      }),
    );
  }

  async findActiveOffer(requestId, helperId, needItemId) {
    return HelpOffer.findOne({
      requestId,
      helperId,
      needItemId,
      activeKey: { $type: "string" },
    })
      .lean()
      .exec();
  }

  async create(data, now) {
    let created = null;
    let notification = null;
    await mongoose.connection.transaction(async (session) => {
      created = null;
      notification = null;
      const openRequest = await HelpRequest.findOneAndUpdate(
        {
          _id: data.requestId,
          ownerId: { $ne: data.helperId },
          status: { $in: openRequestStatuses },
          visibility: "public",
        },
        {
          $inc: { offerActivityVersion: 1 },
          $set: { updatedAt: now },
        },
        { new: true, session, runValidators: true },
      )
        .select("_id ownerId")
        .lean()
        .exec();
      if (!openRequest) {
        return;
      }

      const [offer] = await HelpOffer.create(
        [
          {
            ...data,
            status: "pending",
            activeKey: `${data.requestId}:${data.helperId}:${data.needItemId}`,
            createdAt: now,
            updatedAt: now,
          },
        ],
        { session },
      );
      created = offer.toObject();
      notification = await createNotification({
        recipientId: openRequest.ownerId,
        kind: "offer_received",
        resourceType: "offer",
        resourceId: offer._id,
        requestId: data.requestId,
        now,
        session,
      });
    });
    if (created) created.notification = notification;
    return created;
  }

  async findHydratedById(offerId) {
    return HelpOffer.findById(offerId)
      .populate(publicPersonPopulation("helperId"))
      .populate(requestPopulation())
      .lean()
      .exec();
  }

  async acceptAtomically({ offerId, ownerId, now }) {
    let outcome = "not_found";
    let notification = null;

    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "not_found";
        notification = null;
        const offer = await HelpOffer.findById(offerId).session(session).exec();
        if (!offer) {
          outcome = "not_found";
          return;
        }

        const request = await HelpRequest.findOne({
          _id: offer.requestId,
          ownerId,
        })
          .session(session)
          .lean()
          .exec();
        if (!request) {
          outcome = "not_found";
          return;
        }
        if (offer.status === "accepted") {
          await ensureConversation(
            request,
            offer,
            offer.acceptedAt ?? now,
            session,
          );
          outcome = "accepted";
          return;
        }
        if (offer.status !== "pending") {
          outcome = "resolved";
          return;
        }
        if (!openRequestStatuses.includes(request.status)) {
          outcome = "request_unavailable";
          return;
        }
        if (!(await participantsAvailable(request, offer.helperId, session))) {
          outcome = "request_unavailable";
          return;
        }

        const needItem = request.needItems.find(
          (item) => String(item._id) === String(offer.needItemId),
        );
        if (!needItem || needItem.type !== offer.helpType) {
          outcome = "request_unavailable";
          return;
        }

        const reservation = reservationFor(offer);
        const reserved = needItem[reservation.field] ?? 0;
        const solved = needItem[reservation.solvedField] ?? 0;
        const remaining = needItem[reservation.totalField] - reserved - solved;
        if (remaining < reservation.amount) {
          outcome = "insufficient";
          return;
        }

        const updatedOffer = await HelpOffer.findOneAndUpdate(
          { _id: offerId, status: "pending" },
          {
            $set: { status: "accepted", acceptedAt: now, updatedAt: now },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedOffer) {
          throw new TransitionAbort("state_changed");
        }

        const requestFilter = {
          _id: request._id,
          ownerId,
          status: { $in: openRequestStatuses },
          needItems: {
            $elemMatch: {
              _id: offer.needItemId,
              type: offer.helpType,
              [reservation.field]: counterCondition(
                needItem[reservation.field],
              ),
              [reservation.solvedField]: counterCondition(
                needItem[reservation.solvedField],
              ),
            },
          },
        };
        const updatedRequest = await HelpRequest.findOneAndUpdate(
          requestFilter,
          {
            $inc: { [`needItems.$.${reservation.field}`]: reservation.amount },
            $set: { updatedAt: now },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedRequest) {
          throw new TransitionAbort("state_changed");
        }

        await ensureConversation(request, offer, now, session);

        notification = await createNotification({
          recipientId: offer.helperId,
          kind: "offer_accepted",
          resourceType: "offer",
          resourceId: offer._id,
          requestId: request._id,
          now,
          session,
        });

        outcome = "accepted";
      });
    } catch (error) {
      if (error instanceof TransitionAbort) {
        outcome = error.outcome;
      } else {
        throw error;
      }
    }

    return {
      outcome,
      offer: await this.findHydratedById(offerId),
      notification,
    };
  }

  async reject({ offerId, ownerId, now }) {
    const offer = await HelpOffer.findById(offerId).lean().exec();
    if (!offer) {
      return { outcome: "not_found", offer: null };
    }
    const ownsRequest = await HelpRequest.exists({
      _id: offer.requestId,
      ownerId,
    });
    if (!ownsRequest) {
      return { outcome: "not_found", offer: null };
    }
    if (offer.status === "rejected") {
      return {
        outcome: "rejected",
        offer: await this.findHydratedById(offerId),
      };
    }
    if (offer.status !== "pending") {
      return {
        outcome: "resolved",
        offer: await this.findHydratedById(offerId),
      };
    }

    let updated = null;
    let notification = null;
    await mongoose.connection.transaction(async (session) => {
      updated = null;
      notification = null;
      updated = await HelpOffer.findOneAndUpdate(
        { _id: offerId, status: "pending" },
        {
          $set: { status: "rejected", updatedAt: now },
          $unset: { activeKey: 1 },
        },
        { new: true, runValidators: true, session },
      )
        .lean()
        .exec();
      if (!updated) return;
      notification = await createNotification({
        recipientId: updated.helperId,
        kind: "offer_rejected",
        resourceType: "offer",
        resourceId: updated._id,
        requestId: updated.requestId,
        now,
        session,
      });
    });
    return {
      outcome: updated ? "rejected" : "state_changed",
      offer: await this.findHydratedById(offerId),
      notification,
    };
  }

  async withdraw({ offerId, helperId, now }) {
    const offer = await HelpOffer.findOne({ _id: offerId, helperId })
      .lean()
      .exec();
    if (!offer) {
      return { outcome: "not_found", offer: null };
    }
    if (offer.status === "withdrawn") {
      return {
        outcome: "withdrawn",
        offer: await this.findHydratedById(offerId),
      };
    }
    if (offer.status !== "pending") {
      return {
        outcome: "resolved",
        offer: await this.findHydratedById(offerId),
      };
    }

    const updated = await HelpOffer.findOneAndUpdate(
      { _id: offerId, helperId, status: "pending" },
      {
        $set: { status: "withdrawn", updatedAt: now },
        $unset: { activeKey: 1 },
      },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
    return {
      outcome: updated ? "withdrawn" : "state_changed",
      offer: await this.findHydratedById(offerId),
    };
  }

  async start({ offerId, helperId, now }) {
    let outcome = "not_found";

    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "not_found";
        const offer = await HelpOffer.findOne({ _id: offerId, helperId })
          .session(session)
          .lean()
          .exec();
        if (!offer) {
          outcome = "not_found";
          return;
        }
        if (offer.status === "in_progress") {
          outcome = "started";
          return;
        }
        if (offer.status !== "accepted") {
          outcome = "resolved";
          return;
        }

        const request = await HelpRequest.findById(offer.requestId)
          .session(session)
          .lean()
          .exec();
        if (
          !request ||
          !openRequestStatuses.includes(request.status) ||
          !(await participantsAvailable(request, helperId, session))
        ) {
          outcome = "request_unavailable";
          return;
        }

        const updated = await HelpOffer.findOneAndUpdate(
          { _id: offerId, helperId, status: "accepted" },
          { $set: { status: "in_progress", startedAt: now, updatedAt: now } },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updated) {
          throw new TransitionAbort("state_changed");
        }
        outcome = "started";
      });
    } catch (error) {
      if (error instanceof TransitionAbort) {
        outcome = error.outcome;
      } else {
        throw error;
      }
    }

    return { outcome, offer: await this.findHydratedById(offerId) };
  }

  async submitCompletion({
    offerId,
    helperId,
    note,
    actualMinutes,
    fileIds,
    now,
  }) {
    let outcome = "not_found";
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "not_found";
        notification = null;
        const offer = await HelpOffer.findOne({ _id: offerId, helperId })
          .session(session)
          .lean()
          .exec();
        if (!offer) return;
        if (offer.status === "completion_submitted") {
          outcome = "submitted";
          return;
        }
        if (offer.status !== "in_progress") {
          outcome = "resolved";
          return;
        }
        if (
          actualMinutes !== null &&
          !["skill", "time"].includes(offer.helpType)
        ) {
          outcome = "duration_not_applicable";
          return;
        }
        const request = await HelpRequest.findById(offer.requestId)
          .session(session)
          .lean()
          .exec();
        if (
          !request ||
          !openRequestStatuses.includes(request.status) ||
          !(await participantsAvailable(request, helperId, session))
        ) {
          outcome = "request_unavailable";
          return;
        }
        const files = await this.evidenceStorage.verifyForSubmission({
          offerId,
          helperId,
          ids: fileIds,
          now,
          session,
        });
        if (!files) {
          outcome = "evidence_invalid";
          return;
        }
        const updated = await HelpOffer.findOneAndUpdate(
          { _id: offerId, helperId, status: "in_progress" },
          {
            $set: {
              status: "completion_submitted",
              completionSubmittedAt: now,
              updatedAt: now,
            },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updated) throw new TransitionAbort("state_changed");
        await CompletionEvidence.create(
          [
            {
              offerId,
              submittedBy: helperId,
              note,
              actualMinutes,
              files,
              submittedAt: now,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { session },
        );
        await this.evidenceStorage.markAttached({
          offerId,
          helperId,
          ids: fileIds,
          now,
          session,
        });
        notification = await createNotification({
          recipientId: request.ownerId,
          kind: "completion_submitted",
          resourceType: "offer",
          resourceId: offer._id,
          requestId: request._id,
          now,
          session,
        });
        outcome = "submitted";
      });
    } catch (error) {
      if (error instanceof TransitionAbort) outcome = error.outcome;
      else throw error;
    }
    return {
      outcome,
      offer: await this.findHydratedById(offerId),
      evidence: await CompletionEvidence.findOne({ offerId }).lean().exec(),
      notification,
    };
  }

  async disputeCompletion({ offerId, ownerId, reason, now }) {
    let outcome = "not_found";
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "not_found";
        notification = null;
        const offer = await HelpOffer.findById(offerId)
          .session(session)
          .lean()
          .exec();
        if (!offer) return;
        const request = await HelpRequest.findOne({
          _id: offer.requestId,
          ownerId,
        })
          .session(session)
          .lean()
          .exec();
        if (!request) return;
        if (offer.status === "disputed") {
          outcome = "disputed";
          return;
        }
        if (offer.status !== "completion_submitted") {
          outcome = "resolved";
          return;
        }
        if (!openRequestStatuses.includes(request.status)) {
          outcome = "request_unavailable";
          return;
        }
        const updated = await HelpOffer.findOneAndUpdate(
          { _id: offerId, status: "completion_submitted" },
          { $set: { status: "disputed", updatedAt: now } },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updated) throw new TransitionAbort("state_changed");
        const evidence = await CompletionEvidence.findOneAndUpdate(
          { offerId, confirmedAt: null, disputedAt: null },
          {
            $set: {
              disputedBy: ownerId,
              disputedAt: now,
              disputeReason: reason,
              updatedAt: now,
            },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!evidence) throw new TransitionAbort("state_changed");
        notification = await createNotification({
          recipientId: offer.helperId,
          kind: "completion_disputed",
          resourceType: "offer",
          resourceId: offer._id,
          requestId: request._id,
          now,
          session,
        });
        outcome = "disputed";
      });
    } catch (error) {
      if (error instanceof TransitionAbort) outcome = error.outcome;
      else throw error;
    }
    return {
      outcome,
      offer: await this.findHydratedById(offerId),
      evidence: await CompletionEvidence.findOne({ offerId }).lean().exec(),
      notification,
    };
  }

  async confirmCompletion({ offerId, ownerId, now }) {
    let outcome = "not_found";
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "not_found";
        notification = null;
        const offer = await HelpOffer.findById(offerId)
          .session(session)
          .lean()
          .exec();
        if (!offer) return;
        const request = await HelpRequest.findOne({
          _id: offer.requestId,
          ownerId,
        })
          .session(session)
          .lean()
          .exec();
        if (!request) return;
        if (offer.status === "completed") {
          outcome = "completed";
          return;
        }
        if (offer.status !== "completion_submitted") {
          outcome = "resolved";
          return;
        }
        if (
          !openRequestStatuses.includes(request.status) ||
          !(await participantsAvailable(request, offer.helperId, session))
        ) {
          outcome = "request_unavailable";
          return;
        }
        const reservation = reservationFor(offer);
        const needItem = request.needItems.find(
          (item) => String(item._id) === String(offer.needItemId),
        );
        if (
          !needItem ||
          needItem.type !== offer.helpType ||
          (needItem[reservation.field] ?? 0) < reservation.amount ||
          (needItem[reservation.solvedField] ?? 0) + reservation.amount >
            needItem[reservation.totalField]
        ) {
          outcome = "insufficient";
          return;
        }
        const updatedOffer = await HelpOffer.findOneAndUpdate(
          { _id: offerId, status: "completion_submitted" },
          {
            $set: { status: "completed", completedAt: now, updatedAt: now },
            $unset: { activeKey: 1 },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedOffer) throw new TransitionAbort("state_changed");
        const updatedRequest = await HelpRequest.findOneAndUpdate(
          {
            _id: request._id,
            ownerId,
            status: { $in: openRequestStatuses },
            needItems: {
              $elemMatch: {
                _id: offer.needItemId,
                type: offer.helpType,
                [reservation.field]: counterCondition(
                  needItem[reservation.field],
                ),
                [reservation.solvedField]: counterCondition(
                  needItem[reservation.solvedField],
                ),
              },
            },
          },
          {
            $inc: {
              [`needItems.$.${reservation.field}`]: -reservation.amount,
              [`needItems.$.${reservation.solvedField}`]: reservation.amount,
              offerActivityVersion: 1,
            },
            $set: { updatedAt: now },
          },
          { new: true, session, runValidators: true },
        )
          .select("+offerActivityVersion")
          .lean()
          .exec();
        if (!updatedRequest) throw new TransitionAbort("state_changed");
        const fullySolved = requestIsFullySolved(updatedRequest.needItems);
        const nextStatus = fullySolved
          ? "solved"
          : requestHasConfirmedProgress(updatedRequest.needItems)
            ? "partially_solved"
            : "published";
        if (updatedRequest.status !== nextStatus) {
          const statusUpdate = await HelpRequest.findOneAndUpdate(
            {
              _id: request._id,
              status: updatedRequest.status,
              offerActivityVersion: updatedRequest.offerActivityVersion,
            },
            {
              $set: {
                status: nextStatus,
                solvedAt: fullySolved ? now : null,
                updatedAt: now,
              },
            },
            { new: true, session, runValidators: true },
          )
            .lean()
            .exec();
          if (!statusUpdate) throw new TransitionAbort("state_changed");
        }
        const confirmedEvidence = await CompletionEvidence.findOneAndUpdate(
          { offerId, confirmedAt: null, disputedAt: null },
          { $set: { confirmedBy: ownerId, confirmedAt: now, updatedAt: now } },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!confirmedEvidence) throw new TransitionAbort("state_changed");
        if (fullySolved) {
          await HelpOffer.updateMany(
            { requestId: request._id, status: "pending" },
            {
              $set: { status: "cancelled", updatedAt: now },
              $unset: { activeKey: 1 },
            },
            { session, runValidators: true },
          );
        }
        notification = await createNotification({
          recipientId: offer.helperId,
          kind: "completion_confirmed",
          resourceType: "offer",
          resourceId: offer._id,
          requestId: request._id,
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
      offer: await this.findHydratedById(offerId),
      evidence: await CompletionEvidence.findOne({ offerId }).lean().exec(),
      notification,
    };
  }

  async findEvidenceForParticipant(offerId, participantId) {
    const offer = await HelpOffer.findById(offerId)
      .select("requestId helperId")
      .lean()
      .exec();
    if (!offer) return null;
    const request = await HelpRequest.findById(offer.requestId)
      .select("ownerId")
      .lean()
      .exec();
    if (
      !request ||
      ![String(request.ownerId), String(offer.helperId)].includes(
        String(participantId),
      )
    )
      return null;
    return CompletionEvidence.findOne({ offerId }).lean().exec();
  }

  async uploadEvidenceFile({ offerId, helperId, bytes, mimeType, name, now }) {
    const offer = await HelpOffer.findOne({
      _id: offerId,
      helperId,
      status: "in_progress",
    })
      .select("requestId helperId")
      .lean()
      .exec();
    if (!offer) return null;
    const request = await HelpRequest.findById(offer.requestId).lean().exec();
    if (
      !request ||
      !openRequestStatuses.includes(request.status) ||
      !(await participantsAvailable(request, helperId, null))
    )
      return null;
    return this.evidenceStorage.upload({
      offerId,
      helperId,
      bytes,
      mimeType,
      name,
      now,
    });
  }

  async readEvidenceFile({ offerId, fileId, participantId }) {
    const evidence = await this.findEvidenceForParticipant(
      offerId,
      participantId,
    );
    if (
      !evidence ||
      !(evidence.files ?? []).some((file) => String(file.id) === String(fileId))
    )
      return null;
    return this.evidenceStorage.read(fileId);
  }

  async recordEvidenceAccess({ offerId, fileId, participantId, ipHash, now }) {
    await AuditLog.create({
      actorId: participantId,
      action: "completion_evidence_downloaded",
      targetType: "evidence_upload",
      targetId: fileId,
      metadata: { offerId: String(offerId) },
      ipHash,
      createdAt: now,
    });
  }

  async listForHelper({ helperId, status, cursor, limit }) {
    return runPage(
      HelpOffer.find(
        withCursor({ helperId, ...(status ? { status } : {}) }, cursor),
      )
        .sort({ createdAt: -1, _id: -1 })
        .populate(publicPersonPopulation("helperId"))
        .populate(requestPopulation()),
      limit,
    );
  }

  async listForRequestOwner({ requestId, ownerId, status, cursor, limit }) {
    const request = await HelpRequest.findOne({ _id: requestId, ownerId })
      .select("_id")
      .lean()
      .exec();
    if (!request) {
      return null;
    }

    return runPage(
      HelpOffer.find(
        withCursor({ requestId, ...(status ? { status } : {}) }, cursor),
      )
        .sort({ createdAt: -1, _id: -1 })
        .populate(publicPersonPopulation("helperId"))
        .populate(requestPopulation()),
      limit,
    );
  }
}
