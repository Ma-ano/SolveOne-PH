import mongoose from "mongoose";

import { Conversation } from "../models/Conversation.js";
import { HelpOffer } from "../models/HelpOffer.js";
import { HelpRequest } from "../models/HelpRequest.js";
import { Message } from "../models/Message.js";
import { Report } from "../models/Report.js";
import { User } from "../models/User.js";
import { UserBlock } from "../models/UserBlock.js";
import { createNotification } from "./notificationWrites.js";
import { createReportActiveKey } from "../utils/reportKey.js";

const messageableOfferStatuses = [
  "accepted",
  "in_progress",
  "completion_submitted",
  "disputed",
];
const relationshipRequestStatuses = ["published", "partially_solved", "solved"];

function personPopulation(path) {
  return {
    path,
    select: "firstName lastName verification.level accountStatus",
  };
}

function hydrateConversation(query) {
  return query
    .populate(personPopulation("participants"))
    .populate({ path: "requestId", select: "title category status ownerId" })
    .populate({ path: "offerId", select: "status helperId" });
}

function withCursor(filter, cursor) {
  if (!cursor) {
    return filter;
  }
  return {
    ...filter,
    $or: [
      { lastMessageAt: { $lt: cursor.date } },
      { lastMessageAt: cursor.date, _id: { $lt: cursor.id } },
    ],
  };
}

function messageCursor(filter, cursor) {
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

function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function isNewer(message, state) {
  if (!state?.lastReadMessageAt) {
    return true;
  }
  const messageTime = new Date(message.createdAt).getTime();
  const stateTime = new Date(state.lastReadMessageAt).getTime();
  return (
    messageTime > stateTime ||
    (messageTime === stateTime && idOf(message) > idOf(state.lastReadMessageId))
  );
}

async function hasBlock(participants, session) {
  return Boolean(
    await UserBlock.exists({
      $or: [
        { blockerId: participants[0], blockedId: participants[1] },
        { blockerId: participants[1], blockedId: participants[0] },
      ],
    }).session(session),
  );
}

async function relationshipIsMessageable(conversation, session) {
  const participantIds = conversation.participants.map(idOf);
  const [offer, request, activeUsers, blocked] = await Promise.all([
    HelpOffer.findOne({
      _id: conversation.offerId,
      requestId: conversation.requestId,
      helperId: { $in: participantIds },
      status: { $in: messageableOfferStatuses },
    })
      .session(session)
      .select("_id")
      .lean()
      .exec(),
    HelpRequest.findOne({
      _id: conversation.requestId,
      ownerId: { $in: participantIds },
      status: { $in: relationshipRequestStatuses },
    })
      .session(session)
      .select("_id")
      .lean()
      .exec(),
    User.countDocuments({
      _id: { $in: participantIds },
      accountStatus: "active",
    }).session(session),
    hasBlock(participantIds, session),
  ]);
  return Boolean(offer && request && activeUsers === 2 && !blocked);
}

async function hydrateMessage(messageId) {
  return Message.findById(messageId)
    .select("+safetyFlags")
    .populate(personPopulation("senderId"))
    .lean()
    .exec();
}

export class ConversationRepository {
  async listForParticipant({ userId, cursor, limit }) {
    const rows = await hydrateConversation(
      Conversation.find(withCursor({ participants: userId }, cursor)).sort({
        lastMessageAt: -1,
        _id: -1,
      }),
    )
      .limit(limit + 1)
      .lean()
      .exec();
    const items = rows.slice(0, limit);
    await Promise.all(
      items.map(async (conversation) => {
        const state = conversation.readStates.find(
          (candidate) => idOf(candidate.userId) === String(userId),
        );
        const unreadFilter = {
          conversationId: conversation._id,
          senderId: { $ne: userId },
        };
        if (state?.lastReadMessageAt) {
          unreadFilter.$or = [
            { createdAt: { $gt: state.lastReadMessageAt } },
            {
              createdAt: state.lastReadMessageAt,
              _id: { $gt: state.lastReadMessageId },
            },
          ];
        }
        conversation.unreadCount = await Message.countDocuments(unreadFilter);
      }),
    );
    return { items, hasNextPage: rows.length > limit };
  }

  async findForParticipant(conversationId, userId) {
    return hydrateConversation(
      Conversation.findOne({ _id: conversationId, participants: userId }),
    )
      .lean()
      .exec();
  }

  async canJoinRealtime(conversationId, userId) {
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId,
      status: "active",
    })
      .lean()
      .exec();
    return conversation && (await relationshipIsMessageable(conversation, null))
      ? idOf(conversation)
      : null;
  }

  async listMessages({ conversationId, userId, cursor, limit }) {
    const conversation = await this.findForParticipant(conversationId, userId);
    if (!conversation) {
      return null;
    }
    const rows = await Message.find(messageCursor({ conversationId }, cursor))
      .select("+safetyFlags")
      .sort({ createdAt: -1, _id: -1 })
      .populate(personPopulation("senderId"))
      .limit(limit + 1)
      .lean()
      .exec();
    return {
      conversation,
      items: rows.slice(0, limit),
      hasNextPage: rows.length > limit,
    };
  }

  async createTextMessage({
    conversationId,
    senderId,
    clientMessageId,
    content,
    safetyFlags,
    now,
  }) {
    const existing = await Message.findOne({ senderId, clientMessageId })
      .select("+clientMessageId +safetyFlags")
      .lean()
      .exec();
    if (existing) {
      return {
        outcome:
          idOf(existing.conversationId) === String(conversationId) &&
          existing.type === "text" &&
          existing.content === content
            ? "replayed"
            : "client_id_conflict",
        message: await hydrateMessage(existing._id),
        conversation: await this.findForParticipant(conversationId, senderId),
      };
    }

    let outcome = "not_found";
    let messageId = null;
    let notification = null;
    try {
      await mongoose.connection.transaction(async (session) => {
        notification = null;
        const conversation = await Conversation.findOne({
          _id: conversationId,
          participants: senderId,
          status: "active",
        })
          .session(session)
          .lean()
          .exec();
        if (!conversation) {
          outcome = "not_found";
          return;
        }
        if (!(await relationshipIsMessageable(conversation, session))) {
          outcome = "unavailable";
          return;
        }
        const [created] = await Message.create(
          [
            {
              conversationId,
              senderId,
              clientMessageId,
              type: "text",
              content,
              safetyFlags,
              createdAt: now,
            },
          ],
          { session },
        );
        messageId = created._id;
        const updated = await Conversation.findOneAndUpdate(
          { _id: conversationId, status: "active" },
          {
            $set: {
              lastMessageId: created._id,
              lastMessageAt: now,
              updatedAt: now,
            },
          },
          { new: true, session, runValidators: true },
        );
        if (!updated) {
          throw new Error("Conversation changed while saving the message");
        }
        notification = await createNotification({
          recipientId: conversation.participants.find(
            (participant) => idOf(participant) !== String(senderId),
          ),
          kind: "message_received",
          resourceType: "conversation",
          resourceId: conversation._id,
          eventId: created._id,
          requestId: conversation.requestId,
          now,
          session,
        });
        outcome = "created";
      });
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      const duplicate = await Message.findOne({ senderId, clientMessageId })
        .select("+clientMessageId +safetyFlags")
        .lean()
        .exec();
      return {
        outcome:
          duplicate &&
          idOf(duplicate.conversationId) === String(conversationId) &&
          duplicate.type === "text" &&
          duplicate.content === content
            ? "replayed"
            : "client_id_conflict",
        message: duplicate ? await hydrateMessage(duplicate._id) : null,
        conversation: await this.findForParticipant(conversationId, senderId),
      };
    }
    return {
      outcome,
      message: messageId ? await hydrateMessage(messageId) : null,
      conversation: await this.findForParticipant(conversationId, senderId),
      notification,
    };
  }

  async markRead({ conversationId, userId, messageId, now }) {
    let outcome = "not_found";
    await mongoose.connection.transaction(async (session) => {
      const [conversation, message] = await Promise.all([
        Conversation.findOne({ _id: conversationId, participants: userId })
          .session(session)
          .exec(),
        Message.findOne({ _id: messageId, conversationId })
          .session(session)
          .lean()
          .exec(),
      ]);
      if (!conversation || !message) {
        outcome = "not_found";
        return;
      }
      const state = conversation.readStates.find(
        (candidate) => idOf(candidate.userId) === String(userId),
      );
      if (!state) {
        outcome = "not_found";
        return;
      }
      if (isNewer(message, state)) {
        state.lastReadMessageId = message._id;
        state.lastReadMessageAt = message.createdAt;
        conversation.updatedAt = now;
        await conversation.save({ session });
      }
      outcome = "read";
    });
    return {
      outcome,
      conversation:
        outcome === "read"
          ? await this.findForParticipant(conversationId, userId)
          : null,
    };
  }

  async reportMessage({ reporterId, messageId, reason, description, now }) {
    const message = await Message.findById(messageId).lean().exec();
    if (!message || idOf(message.senderId) === String(reporterId)) {
      return { outcome: "not_found", report: null };
    }
    const conversation = await Conversation.findOne({
      _id: message.conversationId,
      participants: reporterId,
    })
      .select("_id")
      .lean()
      .exec();
    if (!conversation) {
      return { outcome: "not_found", report: null };
    }
    const activeKey = createReportActiveKey({
      reporterId,
      targetType: "message",
      targetId: messageId,
    });
    try {
      const report = await Report.create({
        reporterId,
        targetType: "message",
        targetId: messageId,
        reportedUserId: message.senderId,
        conversationId: conversation._id,
        reason,
        description: description ?? null,
        status: "open",
        activeKey,
        createdAt: now,
        updatedAt: now,
      });
      return { outcome: "created", report: report.toObject() };
    } catch (error) {
      if (error?.code !== 11000) {
        throw error;
      }
      return {
        outcome: "duplicate",
        report: await Report.findOne({ activeKey }).lean().exec(),
      };
    }
  }
}
