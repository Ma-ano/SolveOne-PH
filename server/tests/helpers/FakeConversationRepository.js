import { randomBytes } from "node:crypto";

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

function page(rows, limit) {
  return { items: rows.slice(0, limit), hasNextPage: rows.length > limit };
}

function afterCursor(row, cursor, field) {
  if (!cursor) {
    return true;
  }
  const rowTime = new Date(row[field]).getTime();
  const cursorTime = cursor.date.getTime();
  return (
    rowTime < cursorTime ||
    (rowTime === cursorTime && String(row._id) < cursor.id)
  );
}

export class FakeConversationRepository {
  constructor(userRepository, requestRepository, offerRepository) {
    this.userRepository = userRepository;
    this.requestRepository = requestRepository;
    this.offerRepository = offerRepository;
    this.conversations = new Map();
    this.messages = new Map();
    this.reports = new Map();
  }

  ensureForAcceptedOffer(offer, now) {
    const existing = [...this.conversations.values()].find(
      (conversation) => String(conversation.offerId) === String(offer._id),
    );
    if (existing) {
      return existing;
    }
    const request = this.requestRepository.requests.get(
      String(offer.requestId),
    );
    const participants = [String(request.ownerId), String(offer.helperId)];
    const conversation = {
      _id: objectId(),
      participants,
      requestId: String(request._id),
      offerId: String(offer._id),
      status: "active",
      readStates: participants.map((userId) => ({
        userId,
        lastReadMessageId: null,
        lastReadMessageAt: null,
      })),
      lastMessageId: null,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conversation._id, conversation);
    return conversation;
  }

  closeForRequest(requestId, now) {
    for (const conversation of this.conversations.values()) {
      if (
        String(conversation.requestId) === String(requestId) &&
        conversation.status === "active"
      ) {
        conversation.status = "closed";
        conversation.updatedAt = now;
      }
    }
  }

  hydrateConversation(conversation, userId) {
    if (!conversation || !conversation.participants.includes(String(userId))) {
      return null;
    }
    const request = this.requestRepository.requests.get(
      String(conversation.requestId),
    );
    const offer = this.offerRepository.offers.get(String(conversation.offerId));
    const state = conversation.readStates.find(
      (candidate) => candidate.userId === String(userId),
    );
    const unreadCount = [...this.messages.values()].filter((message) => {
      if (
        message.conversationId !== conversation._id ||
        message.senderId === String(userId)
      ) {
        return false;
      }
      if (!state.lastReadMessageAt) {
        return true;
      }
      const messageTime = new Date(message.createdAt).getTime();
      const readTime = new Date(state.lastReadMessageAt).getTime();
      return (
        messageTime > readTime ||
        (messageTime === readTime && message._id > state.lastReadMessageId)
      );
    }).length;
    return {
      ...conversation,
      participants: conversation.participants.map((participantId) =>
        publicPerson(this.userRepository.users.get(participantId)),
      ),
      requestId: request
        ? {
            _id: request._id,
            title: request.title,
            category: request.category,
            status: request.status,
            ownerId: request.ownerId,
          }
        : conversation.requestId,
      offerId: offer
        ? { _id: offer._id, status: offer.status, helperId: offer.helperId }
        : conversation.offerId,
      unreadCount,
    };
  }

  hydrateMessage(message) {
    return message
      ? {
          ...message,
          senderId: publicPerson(
            this.userRepository.users.get(String(message.senderId)),
          ),
        }
      : null;
  }

  async listForParticipant({ userId, cursor, limit }) {
    const rows = [...this.conversations.values()]
      .filter(
        (conversation) =>
          conversation.participants.includes(String(userId)) &&
          afterCursor(conversation, cursor, "lastMessageAt"),
      )
      .sort(
        (left, right) =>
          new Date(right.lastMessageAt) - new Date(left.lastMessageAt) ||
          right._id.localeCompare(left._id),
      )
      .map((conversation) => this.hydrateConversation(conversation, userId));
    return page(rows, limit);
  }

  async findForParticipant(conversationId, userId) {
    return this.hydrateConversation(
      this.conversations.get(String(conversationId)),
      userId,
    );
  }

  async canJoinRealtime(conversationId, userId) {
    const conversation = this.conversations.get(
      String(conversationId).toLowerCase(),
    );
    return conversation?.participants.includes(String(userId)) &&
      this.relationshipAvailable(conversation)
      ? conversation._id
      : null;
  }

  async listMessages({ conversationId, userId, cursor, limit }) {
    const conversation = await this.findForParticipant(conversationId, userId);
    if (!conversation) {
      return null;
    }
    const rows = [...this.messages.values()]
      .filter(
        (message) =>
          message.conversationId === String(conversationId) &&
          afterCursor(message, cursor, "createdAt"),
      )
      .sort(
        (left, right) =>
          new Date(right.createdAt) - new Date(left.createdAt) ||
          right._id.localeCompare(left._id),
      )
      .map((message) => this.hydrateMessage(message));
    return { conversation, ...page(rows, limit) };
  }

  relationshipAvailable(conversation) {
    const offer = this.offerRepository.offers.get(String(conversation.offerId));
    const request = this.requestRepository.requests.get(
      String(conversation.requestId),
    );
    return Boolean(
      conversation.status === "active" &&
      offer &&
      ["accepted", "in_progress", "completion_submitted", "disputed"].includes(
        offer.status,
      ) &&
      request &&
      ["published", "partially_solved", "solved"].includes(request.status) &&
      conversation.participants.every(
        (participantId) =>
          this.userRepository.users.get(participantId)?.accountStatus ===
          "active",
      ) &&
      !this.offerRepository.blocks.has(
        this.offerRepository.relationKey(...conversation.participants),
      ),
    );
  }

  async createTextMessage(input) {
    const conversation = this.conversations.get(String(input.conversationId));
    if (
      !conversation ||
      !conversation.participants.includes(String(input.senderId))
    ) {
      return { outcome: "not_found", message: null, conversation: null };
    }
    const existing = [...this.messages.values()].find(
      (message) =>
        message.senderId === String(input.senderId) &&
        message.clientMessageId === input.clientMessageId,
    );
    if (existing) {
      return {
        outcome:
          existing.conversationId === String(input.conversationId) &&
          existing.content === input.content
            ? "replayed"
            : "client_id_conflict",
        message: this.hydrateMessage(existing),
        conversation: this.hydrateConversation(conversation, input.senderId),
      };
    }
    if (!this.relationshipAvailable(conversation)) {
      return { outcome: "unavailable", message: null, conversation: null };
    }
    const message = {
      _id: objectId(),
      conversationId: String(input.conversationId),
      senderId: String(input.senderId),
      clientMessageId: input.clientMessageId,
      type: "text",
      content: input.content,
      attachment: null,
      safetyFlags: input.safetyFlags,
      editedAt: null,
      deletedAt: null,
      createdAt: input.now,
    };
    this.messages.set(message._id, message);
    conversation.lastMessageId = message._id;
    conversation.lastMessageAt = input.now;
    conversation.updatedAt = input.now;
    return {
      outcome: "created",
      message: this.hydrateMessage(message),
      conversation: this.hydrateConversation(conversation, input.senderId),
    };
  }

  async markRead({ conversationId, userId, messageId, now }) {
    const conversation = this.conversations.get(String(conversationId));
    const message = this.messages.get(String(messageId));
    if (
      !conversation ||
      !conversation.participants.includes(String(userId)) ||
      message?.conversationId !== String(conversationId)
    ) {
      return { outcome: "not_found", conversation: null };
    }
    const state = conversation.readStates.find(
      (candidate) => candidate.userId === String(userId),
    );
    const currentTime = state.lastReadMessageAt
      ? new Date(state.lastReadMessageAt).getTime()
      : -1;
    const nextTime = new Date(message.createdAt).getTime();
    if (
      nextTime > currentTime ||
      (nextTime === currentTime &&
        message._id > (state.lastReadMessageId ?? ""))
    ) {
      state.lastReadMessageId = message._id;
      state.lastReadMessageAt = message.createdAt;
      conversation.updatedAt = now;
    }
    return {
      outcome: "read",
      conversation: this.hydrateConversation(conversation, userId),
    };
  }

  async reportMessage({ reporterId, messageId, reason, description, now }) {
    const message = this.messages.get(String(messageId));
    const conversation = message
      ? this.conversations.get(message.conversationId)
      : null;
    if (
      !message ||
      message.senderId === String(reporterId) ||
      !conversation?.participants.includes(String(reporterId))
    ) {
      return { outcome: "not_found", report: null };
    }
    const activeKey = `message:${messageId}:reporter:${reporterId}`;
    const existing = [...this.reports.values()].find(
      (report) => report.activeKey === activeKey,
    );
    if (existing) {
      return { outcome: "duplicate", report: existing };
    }
    const report = {
      _id: objectId(),
      reporterId: String(reporterId),
      targetType: "message",
      targetId: String(messageId),
      conversationId: conversation._id,
      reason,
      description: description ?? null,
      status: "open",
      activeKey,
      createdAt: now,
      updatedAt: now,
    };
    this.reports.set(report._id, report);
    return { outcome: "created", report };
  }
}
