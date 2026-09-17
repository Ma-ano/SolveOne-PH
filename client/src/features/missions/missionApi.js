import { apiRequest } from "../../services/api/client";

function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const missionApi = Object.freeze({
  list(filters = {}) {
    return apiRequest(`/community-missions${queryString(filters)}`);
  },
  get(requester, missionId) {
    return requester(`/community-missions/${encodeURIComponent(missionId)}`);
  },
  matches(requester, filters = {}) {
    return requester(`/community-missions/matches${queryString(filters)}`);
  },
  create(requester, input, idempotencyKey) {
    return requester("/community-missions", {
      method: "POST",
      body: input,
      idempotencyKey,
    });
  },
  update(requester, missionId, input) {
    return requester(`/community-missions/${encodeURIComponent(missionId)}`, {
      method: "PATCH",
      body: input,
    });
  },
  submit(requester, missionId) {
    return requester(
      `/community-missions/${encodeURIComponent(missionId)}/submit`,
      { method: "POST", body: {} },
    );
  },
  cancel(requester, missionId) {
    return requester(
      `/community-missions/${encodeURIComponent(missionId)}/cancel`,
      { method: "POST", body: {} },
    );
  },
  mine(requester, filters = {}) {
    return requester(`/community-missions/mine${queryString(filters)}`);
  },
  contribute(requester, missionId, input, idempotencyKey) {
    return requester(
      `/community-missions/${encodeURIComponent(missionId)}/contributions`,
      { method: "POST", body: input, idempotencyKey },
    );
  },
  contributions(requester, filters = {}) {
    return requester(`/mission-contributions/mine${queryString(filters)}`);
  },
  transition(requester, contributionId, action, idempotencyKey) {
    return requester(
      `/mission-contributions/${encodeURIComponent(contributionId)}/${action}`,
      {
        method: "POST",
        body: {},
        ...(idempotencyKey ? { idempotencyKey } : {}),
      },
    );
  },
  complete(requester, contributionId, input, idempotencyKey) {
    return requester(
      `/mission-contributions/${encodeURIComponent(contributionId)}/complete`,
      { method: "POST", body: input, idempotencyKey },
    );
  },
  moderationQueue(requester, filters = {}) {
    return requester(`/admin/community-missions${queryString(filters)}`);
  },
  moderate(requester, missionId, action, notes) {
    return requester(
      `/admin/community-missions/${encodeURIComponent(missionId)}/${action === "requestChanges" ? "request-changes" : action}`,
      {
        method: "POST",
        body: action === "approve" ? {} : { notes },
      },
    );
  },
});

export function missionOperationKey(operation, resourceId = "new") {
  return `${operation}:${resourceId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;
}
