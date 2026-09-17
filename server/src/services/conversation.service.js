import {
  serializeConversation,
  serializeMessage,
  serializeReadState,
  serializeReport,
} from "../serializers/conversation.serializer.js";
import { AppError } from "../utils/AppError.js";
import { detectMessageSafetyFlags } from "../utils/messageSafety.js";
import { decodePageCursor, encodePageCursor } from "../utils/pageCursor.js";

function messagingError(statusCode, code, message) {
  return new AppError({ statusCode, code, message });
}

function notFound() {
  return messagingError(
    404,
    "CONVERSATION_NOT_FOUND",
    "Conversation not found",
  );
}

function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function pageInfo(page, scope, field) {
  const last = page.items.at(-1);
  return {
    hasNextPage: page.hasNextPage,
    nextCursor:
      page.hasNextPage && last
        ? encodePageCursor({ scope, date: last[field], id: idOf(last) })
        : null,
  };
}

export class ConversationService {
  constructor({ repository, publisher, clock = () => new Date() }) {
    this.repository = repository;
    this.publisher = publisher;
    this.clock = clock;
  }

  async list(userId, query) {
    const scope = `conversations:${userId}`;
    const page = await this.repository.listForParticipant({
      userId,
      limit: query.limit,
      cursor: decodePageCursor(query.cursor, scope),
    });
    return {
      items: page.items.map((item) => serializeConversation(item, userId)),
      pageInfo: pageInfo(page, scope, "lastMessageAt"),
    };
  }

  async get(userId, conversationId) {
    const conversation = await this.repository.findForParticipant(
      conversationId,
      userId,
    );
    if (!conversation) {
      throw notFound();
    }
    return { conversation: serializeConversation(conversation, userId) };
  }

  async listMessages(userId, conversationId, query) {
    const scope = `messages:${conversationId}:${userId}`;
    const page = await this.repository.listMessages({
      conversationId,
      userId,
      limit: query.limit,
      cursor: decodePageCursor(query.cursor, scope),
    });
    if (!page) {
      throw notFound();
    }
    return {
      conversation: serializeConversation(page.conversation, userId),
      items: page.items.map((message) => serializeMessage(message, userId)),
      pageInfo: pageInfo(page, scope, "createdAt"),
    };
  }

  async sendText(userId, conversationId, input) {
    const safetyFlags = detectMessageSafetyFlags(input.content);
    const result = await this.repository.createTextMessage({
      conversationId,
      senderId: userId,
      clientMessageId: input.clientMessageId,
      content: input.content,
      safetyFlags,
      now: this.clock(),
    });
    if (result.outcome === "not_found") {
      throw notFound();
    }
    if (result.outcome === "unavailable") {
      throw messagingError(
        409,
        "MESSAGING_UNAVAILABLE",
        "Messaging is unavailable for this help relationship",
      );
    }
    if (result.outcome === "client_id_conflict") {
      throw messagingError(
        409,
        "CLIENT_MESSAGE_ID_REUSED",
        "This client message identifier was already used",
      );
    }
    const message = serializeMessage(result.message, userId);
    if (result.outcome === "created") {
      this.publisher.publishMessage({
        conversation: result.conversation,
        message: result.message,
      });
      if (result.notification)
        this.publisher.publishNotification?.({
          recipientId: result.notification.recipientId,
          notificationId: result.notification._id,
        });
    }
    return {
      message,
      replayed: result.outcome === "replayed",
      safetyGuidance: message.requiresCaution
        ? "This message resembles sensitive-credential, payment, harassment, or spam content. Never share credentials or move help to an unsafe payment channel."
        : null,
    };
  }

  async markRead(userId, conversationId, messageId) {
    const result = await this.repository.markRead({
      conversationId,
      userId,
      messageId,
      now: this.clock(),
    });
    if (result.outcome !== "read") {
      throw notFound();
    }
    const readState = serializeReadState(result.conversation, userId);
    this.publisher.publishReadState({
      conversation: result.conversation,
      readState,
    });
    return { readState };
  }

  async reportMessage(userId, messageId, input) {
    const result = await this.repository.reportMessage({
      reporterId: userId,
      messageId,
      reason: input.reason,
      description: input.description,
      now: this.clock(),
    });
    if (result.outcome === "not_found") {
      throw messagingError(404, "MESSAGE_NOT_FOUND", "Message not found");
    }
    return {
      report: serializeReport(result.report),
      duplicate: result.outcome === "duplicate",
    };
  }

  async authorizeRealtime(userId, conversationId) {
    const canonicalId = await this.repository.canJoinRealtime(
      conversationId,
      userId,
    );
    if (!canonicalId) {
      throw notFound();
    }
    return { conversationId: String(canonicalId) };
  }
}
