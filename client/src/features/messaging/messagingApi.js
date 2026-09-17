function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const messagingApi = Object.freeze({
  listConversations(authenticatedRequest, filters = {}) {
    return authenticatedRequest(`/conversations${queryString(filters)}`);
  },
  getConversation(authenticatedRequest, conversationId) {
    return authenticatedRequest(
      `/conversations/${encodeURIComponent(conversationId)}`,
    );
  },
  listMessages(authenticatedRequest, conversationId, filters = {}) {
    return authenticatedRequest(
      `/conversations/${encodeURIComponent(conversationId)}/messages${queryString(filters)}`,
    );
  },
  sendText(authenticatedRequest, conversationId, input) {
    return authenticatedRequest(
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      { method: "POST", body: input },
    );
  },
  markRead(authenticatedRequest, conversationId, messageId) {
    return authenticatedRequest(
      `/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: "POST", body: { messageId } },
    );
  },
  reportMessage(authenticatedRequest, messageId, input) {
    return authenticatedRequest(
      `/messages/${encodeURIComponent(messageId)}/report`,
      { method: "POST", body: input },
    );
  },
});

export function createClientMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
}
