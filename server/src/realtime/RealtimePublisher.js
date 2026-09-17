function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

export class RealtimePublisher {
  attach(io) {
    this.io = io;
  }

  publishMessage({ conversation, message }) {
    if (!this.io) {
      return;
    }
    const conversationId = idOf(conversation);
    const event = { conversationId, messageId: idOf(message) };
    this.io.to(`conversation:${conversationId}`).emit("message:created", event);
    for (const participant of conversation.participants) {
      this.io
        .to(`user:${idOf(participant)}`)
        .emit("conversation:updated", event);
    }
  }

  publishReadState({ conversation, readState }) {
    if (!this.io) {
      return;
    }
    const conversationId = idOf(conversation);
    this.io
      .to(`conversation:${conversationId}`)
      .emit("conversation:read", readState);
  }

  publishNotification({ recipientId, notificationId }) {
    if (!this.io) return;
    this.io.to(`user:${idOf(recipientId)}`).emit("notification:created", {
      notificationId: idOf(notificationId),
    });
  }

  publishNotificationRead({ recipientId, notificationId }) {
    if (!this.io) return;
    this.io.to(`user:${idOf(recipientId)}`).emit("notification:read", {
      notificationId: idOf(notificationId),
    });
  }

  publishNotificationsReadAll({ recipientId }) {
    if (!this.io) return;
    this.io.to(`user:${idOf(recipientId)}`).emit("notification:read-all", {});
  }
}
