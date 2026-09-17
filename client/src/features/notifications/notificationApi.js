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

export const notificationApi = Object.freeze({
  list(authenticatedRequest, filters = {}) {
    return authenticatedRequest(`/notifications${queryString(filters)}`);
  },
  unreadCount(authenticatedRequest) {
    return authenticatedRequest("/notifications/unread-count");
  },
  markRead(authenticatedRequest, notificationId) {
    return authenticatedRequest(
      `/notifications/${encodeURIComponent(notificationId)}/read`,
      { method: "POST", body: {} },
    );
  },
  markAllRead(authenticatedRequest) {
    return authenticatedRequest("/notifications/read-all", {
      method: "POST",
      body: {},
    });
  },
});

export const notificationCopy = Object.freeze({
  offer_received: ["A new offer to help", "Review the offer for your request."],
  offer_accepted: [
    "Your offer was accepted",
    "You can coordinate help privately.",
  ],
  offer_rejected: ["Offer update", "The requester declined your offer."],
  completion_submitted: [
    "Completion ready to review",
    "Confirm or dispute the delivered help.",
  ],
  completion_confirmed: [
    "Help confirmed",
    "The requester confirmed your completed assistance.",
  ],
  completion_disputed: [
    "Completion disputed",
    "Review the requester's concern.",
  ],
  message_received: ["New private message", "Open your help conversation."],
  request_approved: ["Request approved", "Your help request is now published."],
  request_changes_requested: [
    "Changes requested",
    "Review the moderation notes and update your request.",
  ],
  request_rejected: ["Request review update", "Your request was not approved."],
  identity_approved: [
    "Identity verified",
    "Your identity review was approved.",
  ],
  identity_rejected: [
    "Identity review update",
    "Review the decision and feedback privately.",
  ],
  giveaway_reserved: [
    "Your free item was reserved",
    "Review the handoff and confirm only after delivery.",
  ],
  giveaway_confirmation_needed: [
    "Handoff confirmation needed",
    "The other participant confirmed the free-item handoff.",
  ],
  giveaway_handoff_completed: [
    "Free-item handoff completed",
    "Both participants confirmed the item changed hands.",
  ],
  giveaway_reservation_cancelled: [
    "Giveaway reservation cancelled",
    "Reserved quantities were released.",
  ],
  mission_approved: [
    "Mission verified",
    "Your community mission is now public.",
  ],
  mission_changes_requested: [
    "Mission changes requested",
    "Review the private verification notes and revise your mission.",
  ],
  mission_rejected: [
    "Mission review update",
    "Your community mission was not verified for publication.",
  ],
  mission_contribution_received: [
    "New mission contribution",
    "Review the volunteer's specific resource offer.",
  ],
  mission_contribution_accepted: [
    "Mission contribution accepted",
    "Start only when the work is safely coordinated.",
  ],
  mission_contribution_rejected: [
    "Mission contribution update",
    "The mission creator declined this contribution.",
  ],
  mission_completion_submitted: [
    "Mission work ready to confirm",
    "Confirm only after the resource or work was delivered.",
  ],
  mission_contribution_completed: [
    "Mission contribution confirmed",
    "The mission creator confirmed your contribution.",
  ],
  mission_completed: [
    "Community mission completed",
    "All required resources have been confirmed.",
  ],
  mission_cancelled: [
    "Community mission cancelled",
    "The creator cancelled this mission and released reserved capacity.",
  ],
});

export function notificationDestination(notification) {
  const { kind, resourceId, requestId } = notification;
  if (kind.startsWith("giveaway_")) return "/giveaway-handoffs";
  if (
    kind.startsWith("mission_contribution") ||
    [
      "mission_completion_submitted",
      "mission_completed",
      "mission_cancelled",
    ].includes(kind)
  )
    return "/mission-contributions";
  if (kind === "mission_approved")
    return {
      pathname: "/mission-details",
      params: { missionId: resourceId },
    };
  if (["mission_changes_requested", "mission_rejected"].includes(kind))
    return "/my-missions";
  if (kind === "message_received") {
    return {
      pathname: "/conversation",
      params: { conversationId: resourceId },
    };
  }
  if (kind === "offer_received") {
    return { pathname: "/request-offers", params: { requestId } };
  }
  if (kind === "completion_submitted") {
    return {
      pathname: "/offer-completion",
      params: {
        offerId: resourceId,
        requestId,
        perspective: "owner",
        offerStatus: "completion_submitted",
      },
    };
  }
  if (["completion_confirmed", "completion_disputed"].includes(kind)) {
    return {
      pathname: "/offer-completion",
      params: {
        offerId: resourceId,
        requestId,
        perspective: "helper",
        offerStatus: kind === "completion_confirmed" ? "completed" : "disputed",
      },
    };
  }
  if (kind === "request_approved") {
    return { pathname: "/request-details", params: { requestId: resourceId } };
  }
  if (kind === "identity_approved" || kind === "identity_rejected") {
    return "/identity-verification";
  }
  if (kind === "request_changes_requested") {
    return { pathname: "/request-editor", params: { requestId: resourceId } };
  }
  return kind.startsWith("request_") ? "/my-requests" : "/my-offers";
}
