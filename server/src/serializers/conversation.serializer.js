function idOf(value) {
  return String(value?._id ?? value?.id ?? value);
}

function timestamp(value) {
  return value ? new Date(value).toISOString() : null;
}

function serializePerson(user) {
  if (!user || typeof user !== "object") {
    return null;
  }
  const lastInitial = user.lastName?.trim().charAt(0);
  return {
    id: idOf(user),
    displayName: lastInitial
      ? `${user.firstName} ${lastInitial.toLocaleUpperCase("en")}.`
      : user.firstName,
    verificationLevel: user.verification?.level ?? "UNVERIFIED",
  };
}

export const DIGITAL_ALALAY_NOTICE =
  "Never share passwords, OTPs, PINs, CVVs, recovery codes, seed phrases, or private keys. A legitimate helper never needs them.";

export function serializeConversation(conversation, viewerId) {
  const participants = conversation.participants.map(serializePerson);
  const otherParticipant = participants.find(
    (participant) => participant?.id !== String(viewerId),
  );
  const readState = conversation.readStates?.find(
    (state) => idOf(state.userId) === String(viewerId),
  );
  const category = conversation.requestId?.category ?? null;
  const isDigitalAlalay =
    typeof category === "string" &&
    category.toLocaleUpperCase("en") === "DIGITAL_ALALAY";

  return {
    id: idOf(conversation),
    requestId: idOf(conversation.requestId),
    offerId: idOf(conversation.offerId),
    status: conversation.status,
    participants,
    otherParticipant: otherParticipant ?? null,
    request: conversation.requestId
      ? {
          id: idOf(conversation.requestId),
          title: conversation.requestId.title,
          category,
          status: conversation.requestId.status,
        }
      : null,
    offerStatus: conversation.offerId?.status ?? null,
    isDigitalAlalay,
    safetyNotice: isDigitalAlalay ? DIGITAL_ALALAY_NOTICE : null,
    unreadCount: conversation.unreadCount ?? 0,
    lastReadMessageId: readState?.lastReadMessageId
      ? idOf(readState.lastReadMessageId)
      : null,
    lastMessageAt: timestamp(conversation.lastMessageAt),
    createdAt: timestamp(conversation.createdAt),
    updatedAt: timestamp(conversation.updatedAt),
  };
}

export function serializeMessage(message, viewerId) {
  return {
    id: idOf(message),
    conversationId: idOf(message.conversationId),
    senderId: idOf(message.senderId),
    sender: serializePerson(message.senderId),
    isMine: idOf(message.senderId) === String(viewerId),
    type: message.type,
    content: message.deletedAt ? null : message.content,
    attachment: message.deletedAt
      ? null
      : message.attachment
        ? { mimeType: message.attachment.mimeType, url: null }
        : null,
    requiresCaution: (message.safetyFlags?.length ?? 0) > 0,
    createdAt: timestamp(message.createdAt),
    editedAt: timestamp(message.editedAt),
    deletedAt: timestamp(message.deletedAt),
  };
}

export function serializeReadState(conversation, userId) {
  const state = conversation.readStates?.find(
    (candidate) => idOf(candidate.userId) === String(userId),
  );
  return {
    conversationId: idOf(conversation),
    userId: String(userId),
    lastReadMessageId: state?.lastReadMessageId
      ? idOf(state.lastReadMessageId)
      : null,
    lastReadMessageAt: timestamp(state?.lastReadMessageAt),
  };
}

export function serializeReport(report) {
  return {
    id: idOf(report),
    targetType: report.targetType,
    targetId: idOf(report.targetId),
    reason: report.reason,
    description: report.description ?? null,
    status: report.status,
    createdAt: timestamp(report.createdAt),
  };
}
