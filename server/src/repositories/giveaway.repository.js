import mongoose from "mongoose";

import { GiveawayItem } from "../models/GiveawayItem.js";
import { GiveawayReservation } from "../models/GiveawayReservation.js";
import { HelpOffer } from "../models/HelpOffer.js";
import { HelpRequest } from "../models/HelpRequest.js";
import { IdempotencyRecord } from "../models/IdempotencyRecord.js";
import { User } from "../models/User.js";
import { UserBlock } from "../models/UserBlock.js";
import {
  requestHasConfirmedProgress,
  requestIsFullySolved,
} from "../utils/requestProgress.js";
import { createNotification } from "./notificationWrites.js";

const openRequestStatuses = ["published", "partially_solved"];

class TransitionAbort extends Error {
  constructor(outcome) {
    super(outcome);
    this.outcome = outcome;
  }
}

function personPopulation(path) {
  return {
    path,
    match: { accountStatus: "active" },
    select: "firstName lastName verification.level accountStatus",
  };
}

function hydrateReservation(query) {
  return query
    .populate(personPopulation("donorId"))
    .populate(personPopulation("recipientId"))
    .populate({
      path: "itemId",
      select:
        "title description category condition quantity reservedQuantity givenQuantity status givenAt removedAt createdAt updatedAt",
    })
    .populate({
      path: "requestId",
      select: "title status publicLocation needItems",
    });
}

function withDateCursor(filter, field, cursor, direction) {
  if (!cursor) return filter;
  const comparison = direction === 1 ? "$gt" : "$lt";
  return {
    ...filter,
    $or: [
      { [field]: { [comparison]: cursor.date } },
      { [field]: cursor.date, _id: { [comparison]: cursor.id } },
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

function counterCondition(value) {
  return value === undefined || value === null ? { $in: [0, null] } : value;
}

function itemStatus(quantity, reservedQuantity, givenQuantity) {
  if (givenQuantity >= quantity) return "given";
  if (reservedQuantity + givenQuantity >= quantity) return "reserved";
  return "available";
}

function exactText(value) {
  return new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

async function participantsAvailable(donorId, recipientId, session) {
  const [donor, recipient, blocked] = await Promise.all([
    User.exists({ _id: donorId, accountStatus: "active" }).session(session),
    User.exists({ _id: recipientId, accountStatus: "active" }).session(session),
    UserBlock.exists({
      $or: [
        { blockerId: donorId, blockedId: recipientId },
        { blockerId: recipientId, blockedId: donorId },
      ],
    }).session(session),
  ]);
  return Boolean(donor && recipient && !blocked);
}

export class GiveawayRepository {
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
      if (error?.code !== 11000) throw error;
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
    if (!existing) return { outcome: "in_progress" };
    if (existing.requestHash !== requestHash) return { outcome: "mismatch" };
    if (existing.state === "completed")
      return {
        outcome: "replay",
        responseStatus: existing.responseStatus,
        responseBody: existing.responseBody,
      };
    return { outcome: "in_progress" };
  }

  completeIdempotency({
    principalId,
    operation,
    keyHash,
    requestHash,
    responseStatus,
    responseBody,
    now,
  }) {
    return IdempotencyRecord.findOneAndUpdate(
      { principalId, operation, keyHash, requestHash, state: "in_progress" },
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

  async releaseIdempotency(identity) {
    await IdempotencyRecord.deleteOne({ ...identity, state: "in_progress" });
  }

  async createItem(ownerId, input, now) {
    const item = await GiveawayItem.create({
      ownerId,
      ...input,
      publicLocation: {
        city: input.location.city,
        province: input.location.province,
      },
      status: "available",
      createdAt: now,
      updatedAt: now,
    });
    return item.toObject();
  }

  findOwnedItem(itemId, ownerId) {
    return GiveawayItem.findOne({ _id: itemId, ownerId }).lean().exec();
  }

  findPublicItem(itemId) {
    return GiveawayItem.findOne({
      _id: itemId,
      status: { $ne: "removed" },
    })
      .populate(personPopulation("ownerId"))
      .lean()
      .exec();
  }

  listPublic({ limit, cursor, category, condition, province, city }) {
    const filter = withDateCursor(
      {
        status: "available",
        ...(category ? { category } : {}),
        ...(condition ? { condition } : {}),
        ...(province ? { "publicLocation.province": exactText(province) } : {}),
        ...(city ? { "publicLocation.city": exactText(city) } : {}),
        $expr: {
          $gt: ["$quantity", { $add: ["$reservedQuantity", "$givenQuantity"] }],
        },
      },
      "createdAt",
      cursor,
      -1,
    );
    return runPage(
      GiveawayItem.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .populate(personPopulation("ownerId")),
      limit,
    );
  }

  listOwned({ ownerId, status, limit, cursor }) {
    return runPage(
      GiveawayItem.find(
        withDateCursor(
          { ownerId, ...(status ? { status } : {}) },
          "createdAt",
          cursor,
          -1,
        ),
      ).sort({ createdAt: -1, _id: -1 }),
      limit,
    );
  }

  async listMatches({ itemId, ownerId, limit, cursor }) {
    const item = await GiveawayItem.findOne({
      _id: itemId,
      ownerId,
      status: "available",
      $expr: {
        $gt: ["$quantity", { $add: ["$reservedQuantity", "$givenQuantity"] }],
      },
    })
      .select("category")
      .lean()
      .exec();
    if (!item) return null;
    const filter = withDateCursor(
      {
        ownerId: { $ne: ownerId },
        status: { $in: openRequestStatuses },
        visibility: "public",
        category: item.category,
        helpTypes: "item",
        $expr: {
          $anyElementTrue: {
            $map: {
              input: "$needItems",
              as: "need",
              in: {
                $and: [
                  { $eq: ["$$need.type", "item"] },
                  {
                    $gt: [
                      "$$need.quantity",
                      {
                        $add: [
                          { $ifNull: ["$$need.solvedQuantity", 0] },
                          { $ifNull: ["$$need.reservedQuantity", 0] },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      },
      "publishedAt",
      cursor,
      1,
    );
    return runPage(
      HelpRequest.find(filter)
        .sort({ publishedAt: 1, _id: 1 })
        .populate(personPopulation("ownerId")),
      limit,
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
    let outcome = "not_found";
    let reservationId = null;
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "not_found";
        const item = await GiveawayItem.findOne({
          _id: itemId,
          ownerId: { $ne: recipientId },
          status: { $in: ["available", "reserved"] },
        })
          .session(session)
          .lean()
          .exec();
        const request = await HelpRequest.findOne({
          _id: requestId,
          ownerId: recipientId,
          status: { $in: openRequestStatuses },
          visibility: "public",
        })
          .session(session)
          .lean()
          .exec();
        if (!item || !request) return;
        if (
          !(await participantsAvailable(item.ownerId, recipientId, session))
        ) {
          outcome = "unavailable";
          return;
        }
        const need = request.needItems.find(
          (candidate) => String(candidate._id) === String(needItemId),
        );
        if (!need || need.type !== "item") {
          outcome = "need_mismatch";
          return;
        }
        const itemAvailable =
          item.quantity -
          (item.reservedQuantity ?? 0) -
          (item.givenQuantity ?? 0);
        const needRemaining =
          need.quantity -
          (need.reservedQuantity ?? 0) -
          (need.solvedQuantity ?? 0);
        if (quantity > itemAvailable || quantity > needRemaining) {
          outcome = "insufficient";
          return;
        }
        const activeKey = `${itemId}:${recipientId}:${requestId}:${needItemId}`;
        if (
          await GiveawayReservation.exists({
            activeKey: { $eq: activeKey },
          }).session(session)
        ) {
          outcome = "duplicate";
          return;
        }

        const nextItemReserved = (item.reservedQuantity ?? 0) + quantity;
        const updatedItem = await GiveawayItem.findOneAndUpdate(
          {
            _id: itemId,
            status: item.status,
            reservedQuantity: counterCondition(item.reservedQuantity),
            givenQuantity: counterCondition(item.givenQuantity),
          },
          {
            $inc: { reservedQuantity: quantity },
            $set: {
              status: itemStatus(
                item.quantity,
                nextItemReserved,
                item.givenQuantity ?? 0,
              ),
              updatedAt: now,
            },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedItem) throw new TransitionAbort("state_changed");

        const updatedRequest = await HelpRequest.findOneAndUpdate(
          {
            _id: requestId,
            ownerId: recipientId,
            status: { $in: openRequestStatuses },
            needItems: {
              $elemMatch: {
                _id: needItemId,
                type: "item",
                reservedQuantity: counterCondition(need.reservedQuantity),
                solvedQuantity: counterCondition(need.solvedQuantity),
              },
            },
          },
          {
            $inc: { "needItems.$.reservedQuantity": quantity },
            $set: { updatedAt: now },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedRequest) throw new TransitionAbort("state_changed");

        const [reservation] = await GiveawayReservation.create(
          [
            {
              itemId,
              donorId: item.ownerId,
              recipientId,
              requestId,
              needItemId,
              quantity,
              status: "reserved",
              activeKey,
              createdAt: now,
              updatedAt: now,
            },
          ],
          { session },
        );
        reservationId = reservation._id;
        notification = await createNotification({
          recipientId: item.ownerId,
          kind: "giveaway_reserved",
          resourceType: "giveaway_reservation",
          resourceId: reservation._id,
          requestId,
          now,
          session,
        });
        outcome = "reserved";
      });
    } catch (error) {
      if (error instanceof TransitionAbort) outcome = error.outcome;
      else if (error?.code === 11000) outcome = "duplicate";
      else throw error;
    }
    return {
      outcome,
      reservation: reservationId
        ? await this.findReservation(reservationId)
        : null,
      notification,
    };
  }

  findReservation(reservationId) {
    return hydrateReservation(GiveawayReservation.findById(reservationId))
      .lean()
      .exec();
  }

  listReservations({ participantId, status, limit, cursor }) {
    const query = GiveawayReservation.find(
      withDateCursor(
        {
          $or: [{ donorId: participantId }, { recipientId: participantId }],
          ...(status ? { status } : {}),
        },
        "createdAt",
        cursor,
        -1,
      ),
    ).sort({ createdAt: -1, _id: -1 });
    return runPage(hydrateReservation(query), limit);
  }

  async confirmAtomically({ reservationId, actorId, now }) {
    let outcome = "not_found";
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "not_found";
        const reservation = await GiveawayReservation.findOne({
          _id: reservationId,
          $or: [{ donorId: actorId }, { recipientId: actorId }],
        })
          .session(session)
          .lean()
          .exec();
        if (!reservation) return;
        if (reservation.status === "completed") {
          outcome = "completed";
          return;
        }
        if (reservation.status !== "reserved") {
          outcome = "resolved";
          return;
        }
        if (
          !(await participantsAvailable(
            reservation.donorId,
            reservation.recipientId,
            session,
          ))
        ) {
          outcome = "unavailable";
          return;
        }
        const donorActing = String(reservation.donorId) === String(actorId);
        const ownField = donorActing
          ? "donorConfirmedAt"
          : "recipientConfirmedAt";
        const otherField = donorActing
          ? "recipientConfirmedAt"
          : "donorConfirmedAt";
        if (reservation[ownField]) {
          outcome = "confirmed";
          return;
        }
        const completes = Boolean(reservation[otherField]);
        const update = {
          $set: {
            [ownField]: now,
            ...(completes ? { status: "completed", completedAt: now } : {}),
            updatedAt: now,
          },
          ...(completes ? { $unset: { activeKey: 1 } } : {}),
        };
        const updatedReservation = await GiveawayReservation.findOneAndUpdate(
          { _id: reservationId, status: "reserved", [ownField]: null },
          update,
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedReservation) throw new TransitionAbort("state_changed");

        if (completes) {
          const item = await GiveawayItem.findById(reservation.itemId)
            .session(session)
            .lean()
            .exec();
          const request = await HelpRequest.findOne({
            _id: reservation.requestId,
            ownerId: reservation.recipientId,
            status: { $in: openRequestStatuses },
          })
            .session(session)
            .lean()
            .exec();
          const need = request?.needItems.find(
            (candidate) =>
              String(candidate._id) === String(reservation.needItemId),
          );
          if (
            !item ||
            !request ||
            !need ||
            need.type !== "item" ||
            (item.reservedQuantity ?? 0) < reservation.quantity ||
            (need.reservedQuantity ?? 0) < reservation.quantity ||
            (item.givenQuantity ?? 0) + reservation.quantity > item.quantity ||
            (need.solvedQuantity ?? 0) + reservation.quantity > need.quantity
          )
            throw new TransitionAbort("insufficient");

          const nextReserved =
            (item.reservedQuantity ?? 0) - reservation.quantity;
          const nextGiven = (item.givenQuantity ?? 0) + reservation.quantity;
          const updatedItem = await GiveawayItem.findOneAndUpdate(
            {
              _id: item._id,
              reservedQuantity: counterCondition(item.reservedQuantity),
              givenQuantity: counterCondition(item.givenQuantity),
            },
            {
              $inc: {
                reservedQuantity: -reservation.quantity,
                givenQuantity: reservation.quantity,
              },
              $set: {
                status: itemStatus(item.quantity, nextReserved, nextGiven),
                givenAt: nextGiven >= item.quantity ? now : item.givenAt,
                updatedAt: now,
              },
            },
            { new: true, session, runValidators: true },
          )
            .lean()
            .exec();
          if (!updatedItem) throw new TransitionAbort("state_changed");

          const updatedRequest = await HelpRequest.findOneAndUpdate(
            {
              _id: request._id,
              ownerId: reservation.recipientId,
              status: { $in: openRequestStatuses },
              needItems: {
                $elemMatch: {
                  _id: reservation.needItemId,
                  type: "item",
                  reservedQuantity: counterCondition(need.reservedQuantity),
                  solvedQuantity: counterCondition(need.solvedQuantity),
                },
              },
            },
            {
              $inc: {
                "needItems.$.reservedQuantity": -reservation.quantity,
                "needItems.$.solvedQuantity": reservation.quantity,
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
          const nextRequestStatus = fullySolved
            ? "solved"
            : requestHasConfirmedProgress(updatedRequest.needItems)
              ? "partially_solved"
              : "published";
          if (updatedRequest.status !== nextRequestStatus) {
            const statusUpdate = await HelpRequest.findOneAndUpdate(
              {
                _id: request._id,
                status: updatedRequest.status,
                offerActivityVersion: updatedRequest.offerActivityVersion,
              },
              {
                $set: {
                  status: nextRequestStatus,
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
          if (fullySolved)
            await HelpOffer.updateMany(
              { requestId: request._id, status: "pending" },
              {
                $set: { status: "cancelled", updatedAt: now },
                $unset: { activeKey: 1 },
              },
              { session, runValidators: true },
            );
        }

        const otherId = donorActing
          ? reservation.recipientId
          : reservation.donorId;
        notification = await createNotification({
          recipientId: otherId,
          kind: completes
            ? "giveaway_handoff_completed"
            : "giveaway_confirmation_needed",
          resourceType: "giveaway_reservation",
          resourceId: reservation._id,
          requestId: reservation.requestId,
          now,
          session,
        });
        outcome = completes ? "completed" : "confirmed";
      });
    } catch (error) {
      if (error instanceof TransitionAbort) outcome = error.outcome;
      else throw error;
    }
    return {
      outcome,
      reservation: await this.findReservation(reservationId),
      notification,
    };
  }

  async cancelAtomically({ reservationId, actorId, now }) {
    let outcome = "not_found";
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        outcome = "not_found";
        const reservation = await GiveawayReservation.findOne({
          _id: reservationId,
          $or: [{ donorId: actorId }, { recipientId: actorId }],
        })
          .session(session)
          .lean()
          .exec();
        if (!reservation) return;
        if (reservation.status !== "reserved") {
          outcome = "resolved";
          return;
        }
        if (reservation.donorConfirmedAt || reservation.recipientConfirmedAt) {
          outcome = "confirmation_started";
          return;
        }
        const item = await GiveawayItem.findById(reservation.itemId)
          .session(session)
          .lean()
          .exec();
        const request = await HelpRequest.findById(reservation.requestId)
          .session(session)
          .lean()
          .exec();
        const need = request?.needItems.find(
          (candidate) =>
            String(candidate._id) === String(reservation.needItemId),
        );
        if (
          !item ||
          !request ||
          !need ||
          (item.reservedQuantity ?? 0) < reservation.quantity ||
          (need.reservedQuantity ?? 0) < reservation.quantity
        )
          throw new TransitionAbort("state_changed");

        const updatedReservation = await GiveawayReservation.findOneAndUpdate(
          { _id: reservationId, status: "reserved" },
          {
            $set: {
              status: "cancelled",
              cancelledAt: now,
              cancelledBy: actorId,
              updatedAt: now,
            },
            $unset: { activeKey: 1 },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedReservation) throw new TransitionAbort("state_changed");

        const nextReserved =
          (item.reservedQuantity ?? 0) - reservation.quantity;
        const updatedItem = await GiveawayItem.findOneAndUpdate(
          {
            _id: item._id,
            reservedQuantity: counterCondition(item.reservedQuantity),
            givenQuantity: counterCondition(item.givenQuantity),
          },
          {
            $inc: { reservedQuantity: -reservation.quantity },
            $set: {
              status: itemStatus(
                item.quantity,
                nextReserved,
                item.givenQuantity ?? 0,
              ),
              updatedAt: now,
            },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedItem) throw new TransitionAbort("state_changed");

        const updatedRequest = await HelpRequest.findOneAndUpdate(
          {
            _id: request._id,
            needItems: {
              $elemMatch: {
                _id: reservation.needItemId,
                type: "item",
                reservedQuantity: counterCondition(need.reservedQuantity),
                solvedQuantity: counterCondition(need.solvedQuantity),
              },
            },
          },
          {
            $inc: {
              "needItems.$.reservedQuantity": -reservation.quantity,
              offerActivityVersion: 1,
            },
            $set: { updatedAt: now },
          },
          { new: true, session, runValidators: true },
        )
          .lean()
          .exec();
        if (!updatedRequest) throw new TransitionAbort("state_changed");

        const otherId =
          String(actorId) === String(reservation.donorId)
            ? reservation.recipientId
            : reservation.donorId;
        notification = await createNotification({
          recipientId: otherId,
          kind: "giveaway_reservation_cancelled",
          resourceType: "giveaway_reservation",
          resourceId: reservation._id,
          requestId: reservation.requestId,
          now,
          session,
        });
        outcome = "cancelled";
      });
    } catch (error) {
      if (error instanceof TransitionAbort) outcome = error.outcome;
      else throw error;
    }
    return {
      outcome,
      reservation: await this.findReservation(reservationId),
      notification,
    };
  }

  async removeOwned(itemId, ownerId, now) {
    return GiveawayItem.findOneAndUpdate(
      {
        _id: itemId,
        ownerId,
        status: "available",
        reservedQuantity: 0,
      },
      { $set: { status: "removed", removedAt: now, updatedAt: now } },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
  }
}
