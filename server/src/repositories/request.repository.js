import mongoose from "mongoose";

import { createNotification } from "./notificationWrites.js";

import { AuditLog } from "../models/AuditLog.js";
import { Conversation } from "../models/Conversation.js";
import { HelpOffer } from "../models/HelpOffer.js";
import { HelpRequest } from "../models/HelpRequest.js";
import { GiveawayItem } from "../models/GiveawayItem.js";
import { GiveawayReservation } from "../models/GiveawayReservation.js";
import { User } from "../models/User.js";

function publicOwnerPopulation() {
  return {
    path: "ownerId",
    match: { accountStatus: "active" },
    select: "firstName lastName verification.level accountStatus",
  };
}

function moderationOwnerPopulation() {
  return {
    path: "ownerId",
    select: "firstName lastName verification.level accountStatus",
  };
}

function withCursor(filter, field, cursor, direction) {
  if (!cursor) {
    return filter;
  }

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

function remainingQuantityExpression(item = "$$this") {
  return {
    $max: [
      0,
      {
        $subtract: [
          { $ifNull: [`${item}.quantity`, 0] },
          {
            $add: [
              { $ifNull: [`${item}.solvedQuantity`, 0] },
              { $ifNull: [`${item}.reservedQuantity`, 0] },
            ],
          },
        ],
      },
    ],
  };
}

function financialRemainingExpression() {
  return {
    $reduce: {
      input: "$needItems",
      initialValue: 0,
      in: {
        $add: [
          "$$value",
          {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$$this.type", "money"] },
                  then: {
                    $max: [
                      0,
                      {
                        $subtract: [
                          { $ifNull: ["$$this.estimatedValueCentavos", 0] },
                          {
                            $add: [
                              {
                                $ifNull: ["$$this.solvedValueCentavos", 0],
                              },
                              {
                                $ifNull: ["$$this.reservedValueCentavos", 0],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                },
                {
                  case: { $eq: ["$$this.type", "item"] },
                  then: {
                    $cond: [
                      { $gt: [{ $ifNull: ["$$this.quantity", 0] }, 0] },
                      {
                        $ceil: {
                          $multiply: [
                            {
                              $ifNull: ["$$this.estimatedValueCentavos", 0],
                            },
                            {
                              $divide: [
                                remainingQuantityExpression(),
                                "$$this.quantity",
                              ],
                            },
                          ],
                        },
                      },
                      0,
                    ],
                  },
                },
              ],
              default: 0,
            },
          },
        ],
      },
    },
  };
}

function estimatedMinutesExpression() {
  return {
    $reduce: {
      input: "$needItems",
      initialValue: 0,
      in: {
        $add: [
          "$$value",
          {
            $cond: [
              {
                $and: [
                  { $in: ["$$this.type", ["skill", "time"]] },
                  { $gt: [{ $ifNull: ["$$this.estimatedMinutes", 0] }, 0] },
                  { $gt: [{ $ifNull: ["$$this.quantity", 0] }, 0] },
                ],
              },
              {
                $ceil: {
                  $multiply: [
                    "$$this.estimatedMinutes",
                    {
                      $divide: [
                        remainingQuantityExpression(),
                        "$$this.quantity",
                      ],
                    },
                  ],
                },
              },
              0,
            ],
          },
        ],
      },
    },
  };
}

function discoveryCursorMatch(cursor) {
  if (!cursor) return null;
  const values = [
    ["discoverySkillMatch", cursor.skillMatch, -1],
    ["discoveryVerifiedRank", cursor.verified, -1],
    ["discoveryUrgencyRank", cursor.urgency, -1],
    ["discoveryNeededBy", cursor.neededBy, 1],
    ["discoveryNearbyRank", cursor.nearby, -1],
    ["discoveryPublishedAt", cursor.publishedAt, 1],
    ["_id", new mongoose.Types.ObjectId(cursor.id), 1],
  ];
  return {
    $or: values.map(([field, value, direction], index) => ({
      ...Object.fromEntries(
        values
          .slice(0, index)
          .map(([previousField, previousValue]) => [
            previousField,
            previousField === "_id"
              ? new mongoose.Types.ObjectId(previousValue)
              : previousValue,
          ]),
      ),
      [field]: { [direction === 1 ? "$gt" : "$lt"]: value },
    })),
  };
}

export class RequestRepository {
  findDiscoveryViewer(userId) {
    return User.findOne({ _id: userId, accountStatus: "active" })
      .select("skills location.city location.province")
      .lean()
      .exec();
  }

  async createDraft(ownerId, data, now) {
    const request = await HelpRequest.create({
      ownerId,
      ...data,
      status: "draft",
      createdAt: now,
      updatedAt: now,
    });
    return request.toObject();
  }

  async findOwnedById(requestId, ownerId) {
    return HelpRequest.findOne({ _id: requestId, ownerId }).lean().exec();
  }

  async updateOwnedEditable(requestId, ownerId, changes, now) {
    return HelpRequest.findOneAndUpdate(
      {
        _id: requestId,
        ownerId,
        status: { $in: ["draft", "changes_requested"] },
      },
      { $set: { ...changes, updatedAt: now } },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
  }

  async submitOwned(requestId, ownerId, submission, now) {
    return HelpRequest.findOneAndUpdate(
      {
        _id: requestId,
        ownerId,
        status: { $in: ["draft", "changes_requested"] },
      },
      {
        $set: {
          ...submission,
          status: "pending_review",
          "moderation.submittedAt": now,
          "moderation.reviewerId": null,
          "moderation.reviewedAt": null,
          updatedAt: now,
        },
      },
      { new: true, runValidators: true },
    )
      .lean()
      .exec();
  }

  async cancelOwned(requestId, ownerId, now) {
    let updated = null;
    await mongoose.connection.transaction(async (session) => {
      updated = null;
      const request = await HelpRequest.findOne({
        _id: requestId,
        ownerId,
        status: {
          $in: [
            "draft",
            "changes_requested",
            "pending_review",
            "published",
            "partially_solved",
          ],
        },
      })
        .session(session)
        .exec();
      if (!request) {
        return;
      }

      const contestedCompletion = await HelpOffer.exists({
        requestId,
        status: { $in: ["completion_submitted", "disputed"] },
      }).session(session);
      const contestedGiveaway = await GiveawayReservation.exists({
        requestId,
        status: "reserved",
        $or: [
          { donorConfirmedAt: { $ne: null } },
          { recipientConfirmedAt: { $ne: null } },
        ],
      }).session(session);
      if (contestedCompletion || contestedGiveaway) return;

      const reservingOffers = await HelpOffer.find({
        requestId,
        status: { $in: ["accepted", "in_progress"] },
      })
        .session(session)
        .lean()
        .exec();

      for (const offer of reservingOffers) {
        const needItem = request.needItems.id(offer.needItemId);
        if (!needItem) {
          continue;
        }
        if (offer.helpType === "money") {
          needItem.reservedValueCentavos = Math.max(
            0,
            (needItem.reservedValueCentavos ?? 0) -
              (offer.pledgedValueCentavos ?? 0),
          );
        } else {
          needItem.reservedQuantity = Math.max(
            0,
            (needItem.reservedQuantity ?? 0) - (offer.quantity ?? 0),
          );
        }
      }

      const giveawayReservations = await GiveawayReservation.find({
        requestId,
        status: "reserved",
      })
        .session(session)
        .exec();
      for (const reservation of giveawayReservations) {
        const item = await GiveawayItem.findById(reservation.itemId)
          .session(session)
          .exec();
        if (!item || item.reservedQuantity < reservation.quantity)
          throw new Error("Giveaway reservation inventory is inconsistent");
        const needItem = request.needItems.id(reservation.needItemId);
        if (
          !needItem ||
          needItem.type !== "item" ||
          needItem.reservedQuantity < reservation.quantity
        )
          throw new Error("Giveaway reservation request is inconsistent");
        item.reservedQuantity -= reservation.quantity;
        item.status =
          item.givenQuantity >= item.quantity
            ? "given"
            : item.reservedQuantity + item.givenQuantity >= item.quantity
              ? "reserved"
              : "available";
        item.updatedAt = now;
        await item.save({ session });
        needItem.reservedQuantity -= reservation.quantity;
        const cancelledReservation = await GiveawayReservation.findOneAndUpdate(
          { _id: reservation._id, status: "reserved" },
          {
            $set: {
              status: "cancelled",
              cancelledAt: now,
              cancelledBy: ownerId,
              updatedAt: now,
            },
            $unset: { activeKey: 1 },
          },
          { new: true, session, runValidators: true },
        );
        if (!cancelledReservation)
          throw new Error("Giveaway reservation state changed");
      }

      request.status = "cancelled";
      request.updatedAt = now;
      await request.save({ session });
      await HelpOffer.updateMany(
        {
          requestId,
          status: { $in: ["pending", "accepted", "in_progress"] },
        },
        {
          $set: { status: "cancelled", updatedAt: now },
          $unset: { activeKey: 1 },
        },
        { session, runValidators: true },
      );
      await Conversation.updateMany(
        { requestId, status: "active" },
        { $set: { status: "closed", updatedAt: now } },
        { session, runValidators: true },
      );
      updated = request.toObject();
    });
    return updated;
  }

  async findVisibleById(requestId) {
    return HelpRequest.findOne({
      _id: requestId,
      status: { $in: ["published", "partially_solved", "solved"] },
      visibility: "public",
    })
      .populate(publicOwnerPopulation())
      .lean()
      .exec();
  }

  async listPublic({ limit, cursor, category, helpType, urgency }) {
    const filter = {
      status: { $in: ["published", "partially_solved"] },
      visibility: "public",
      ...(category ? { category } : {}),
      ...(helpType ? { helpTypes: helpType } : {}),
      ...(urgency ? { urgency } : {}),
    };
    return runPage(
      HelpRequest.find(withCursor(filter, "publishedAt", cursor, -1))
        .sort({ publishedAt: -1, _id: -1 })
        .populate(publicOwnerPopulation()),
      limit,
    );
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
    const skillExpression = {
      $setIntersection: [
        {
          $map: {
            input: { $ifNull: ["$requiredSkills", []] },
            as: "skill",
            in: { $toLower: { $trim: { input: "$$skill" } } },
          },
        },
        selectedSkills,
      ],
    };
    const provinceMatches = province
      ? {
          $eq: [
            {
              $toLower: {
                $ifNull: ["$publicLocation.province", ""],
              },
            },
            province,
          ],
        }
      : false;
    const cityMatches =
      city && province
        ? {
            $and: [
              provinceMatches,
              {
                $eq: [
                  {
                    $toLower: {
                      $ifNull: ["$publicLocation.city", ""],
                    },
                  },
                  city,
                ],
              },
            ],
          }
        : false;
    const baseMatch = {
      status: { $in: ["published", "partially_solved"] },
      visibility: "public",
      ...(excludedOwnerId
        ? { ownerId: { $ne: new mongoose.Types.ObjectId(excludedOwnerId) } }
        : {}),
      ...(category ? { category } : {}),
      ...(urgency ? { urgency } : {}),
      ...(["skills", "no_money"].includes(mode)
        ? {
            helpTypes: helpType ?? { $in: ["skill", "time"] },
          }
        : helpType
          ? { helpTypes: helpType }
          : {}),
    };
    const pipeline = [
      { $match: baseMatch },
      {
        $lookup: {
          from: User.collection.name,
          let: { ownerId: "$ownerId" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$_id", "$$ownerId"] },
                accountStatus: "active",
              },
            },
            {
              $project: {
                firstName: 1,
                lastName: 1,
                verification: 1,
                accountStatus: 1,
              },
            },
          ],
          as: "discoveryOwner",
        },
      },
      { $set: { discoveryOwner: { $first: "$discoveryOwner" } } },
      { $match: { discoveryOwner: { $ne: null } } },
      {
        $set: {
          discoveryMatchedSkills: skillExpression,
          discoveryVerifiedRank: {
            $cond: [
              {
                $in: [
                  "$discoveryOwner.verification.level",
                  ["EMAIL_VERIFIED", "IDENTITY_VERIFIED", "PARTNER_VERIFIED"],
                ],
              },
              1,
              0,
            ],
          },
          discoveryUrgencyRank: {
            $switch: {
              branches: [
                { case: { $eq: ["$urgency", "time_sensitive"] }, then: 2 },
                { case: { $eq: ["$urgency", "important"] }, then: 1 },
              ],
              default: 0,
            },
          },
          discoveryNearbyRank: {
            $switch: {
              branches: [
                { case: cityMatches, then: 2 },
                { case: provinceMatches, then: 1 },
              ],
              default: 0,
            },
          },
          discoveryFinancialRemaining: financialRemainingExpression(),
          discoveryEstimatedMinutes: estimatedMinutesExpression(),
          discoveryNeededBy: {
            $ifNull: ["$neededBy", new Date("9999-12-31T23:59:59.999Z")],
          },
          discoveryPublishedAt: { $ifNull: ["$publishedAt", "$createdAt"] },
        },
      },
      {
        $set: {
          discoverySkillMatch: { $size: "$discoveryMatchedSkills" },
        },
      },
    ];
    if (["skills", "no_money"].includes(mode)) {
      pipeline.push({ $match: { discoverySkillMatch: { $gt: 0 } } });
    }
    if (mode === "nearby") {
      pipeline.push({ $match: { discoveryNearbyRank: { $gt: 0 } } });
    }
    if (budgetCentavos !== null) {
      pipeline.push({
        $match: {
          discoveryFinancialRemaining: { $gt: 0, $lte: budgetCentavos },
        },
      });
    }
    const cursorMatch = discoveryCursorMatch(cursor);
    if (cursorMatch) pipeline.push({ $match: cursorMatch });
    pipeline.push(
      {
        $sort: {
          discoverySkillMatch: -1,
          discoveryVerifiedRank: -1,
          discoveryUrgencyRank: -1,
          discoveryNeededBy: 1,
          discoveryNearbyRank: -1,
          discoveryPublishedAt: 1,
          _id: 1,
        },
      },
      { $limit: limit + 1 },
      {
        $set: {
          ownerId: "$discoveryOwner",
          discoveryRemainingBudgetCentavos:
            budgetCentavos === null ? null : "$discoveryFinancialRemaining",
          discoveryEstimatedMinutes: {
            $cond: [
              { $gt: ["$discoveryEstimatedMinutes", 0] },
              "$discoveryEstimatedMinutes",
              null,
            ],
          },
        },
      },
      {
        $project: {
          discoveryOwner: 0,
          discoveryFinancialRemaining: 0,
          location: 0,
          moderation: 0,
          safetyFlags: 0,
          verificationRequirements: 0,
          offerActivityVersion: 0,
        },
      },
    );
    const rows = await HelpRequest.aggregate(pipeline).exec();
    return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
  }

  async listOwned({ ownerId, limit, cursor }) {
    return runPage(
      HelpRequest.find(withCursor({ ownerId }, "updatedAt", cursor, -1)).sort({
        updatedAt: -1,
        _id: -1,
      }),
      limit,
    );
  }

  async findForModeration(requestId) {
    return HelpRequest.findById(requestId)
      .select("+safetyFlags")
      .populate(moderationOwnerPopulation())
      .lean()
      .exec();
  }

  async listForModeration({ status, limit, cursor }) {
    return runPage(
      HelpRequest.find(
        withCursor(
          { status, "moderation.submittedAt": { $ne: null } },
          "moderation.submittedAt",
          cursor,
          1,
        ),
      )
        .select("+safetyFlags")
        .sort({ "moderation.submittedAt": 1, _id: 1 })
        .populate(moderationOwnerPopulation()),
      limit,
    );
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
    let updated;
    let notification = null;
    await mongoose.connection.transaction(async (session) => {
      updated = undefined;
      notification = null;
      updated = await HelpRequest.findOneAndUpdate(
        {
          _id: requestId,
          ownerId: { $ne: actorId },
          status: "pending_review",
        },
        {
          $set: {
            status: nextStatus,
            "moderation.reviewerId": actorId,
            "moderation.reviewedAt": now,
            "moderation.notes": notes,
            publishedAt: nextStatus === "published" ? now : null,
            updatedAt: now,
          },
        },
        { new: true, runValidators: true, session },
      )
        .select("+safetyFlags")
        .lean()
        .exec();

      if (!updated) {
        return;
      }

      const [audit] = await AuditLog.create(
        [
          {
            actorId,
            action,
            targetType: "help_request",
            targetId: requestId,
            metadata: { fromStatus: "pending_review", toStatus: nextStatus },
            ipHash,
            createdAt: now,
          },
        ],
        { session },
      );
      notification = await createNotification({
        recipientId: updated.ownerId,
        kind: action,
        resourceType: "request",
        resourceId: requestId,
        eventId: audit._id,
        requestId,
        now,
        session,
      });
    });
    if (updated) updated.notification = notification;
    return updated;
  }
}
