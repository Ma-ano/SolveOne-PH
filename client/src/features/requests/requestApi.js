import { apiRequest } from "../../services/api/client";

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

export const requestApi = Object.freeze({
  listPublic(filters = {}) {
    return apiRequest(`/requests${queryString(filters)}`);
  },

  getPublic(requestId) {
    return apiRequest(`/requests/${encodeURIComponent(requestId)}`);
  },

  discover(requester, filters = {}) {
    return requester(`/requests/discover${queryString(filters)}`);
  },

  solvable(requester, filters = {}) {
    return requester(`/requests/solvable${queryString(filters)}`);
  },

  listMine(authenticatedRequest, filters = {}) {
    return authenticatedRequest(`/requests/mine${queryString(filters)}`);
  },

  getMine(authenticatedRequest, requestId) {
    return authenticatedRequest(`/requests/${encodeURIComponent(requestId)}`);
  },

  createDraft(authenticatedRequest, input) {
    return authenticatedRequest("/requests", {
      method: "POST",
      body: input,
    });
  },

  updateDraft(authenticatedRequest, requestId, input) {
    return authenticatedRequest(`/requests/${encodeURIComponent(requestId)}`, {
      method: "PATCH",
      body: input,
    });
  },

  submit(authenticatedRequest, requestId) {
    return authenticatedRequest(
      `/requests/${encodeURIComponent(requestId)}/submit`,
      {
        method: "POST",
        body: {},
      },
    );
  },

  cancel(authenticatedRequest, requestId) {
    return authenticatedRequest(
      `/requests/${encodeURIComponent(requestId)}/cancel`,
      {
        method: "POST",
        body: {},
      },
    );
  },

  listForModeration(authenticatedRequest, filters = {}) {
    return authenticatedRequest(`/admin/requests${queryString(filters)}`);
  },

  moderate(authenticatedRequest, requestId, action, notes) {
    const path = action === "requestChanges" ? "request-changes" : action;
    return authenticatedRequest(
      `/admin/requests/${encodeURIComponent(requestId)}/${path}`,
      {
        method: "POST",
        body: notes === undefined ? {} : { notes },
      },
    );
  },
});
