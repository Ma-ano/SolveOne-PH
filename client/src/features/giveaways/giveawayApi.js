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

export const giveawayApi = Object.freeze({
  list(filters = {}) {
    return apiRequest(`/giveaway-items${queryString(filters)}`);
  },
  get(requester, itemId) {
    return requester(`/giveaway-items/${encodeURIComponent(itemId)}`);
  },
  create(requester, input, idempotencyKey) {
    return requester("/giveaway-items", {
      method: "POST",
      body: input,
      idempotencyKey,
    });
  },
  listMine(requester, filters = {}) {
    return requester(`/giveaway-items/mine${queryString(filters)}`);
  },
  matches(requester, itemId, filters = {}) {
    return requester(
      `/giveaway-items/${encodeURIComponent(itemId)}/matches${queryString(filters)}`,
    );
  },
  reserve(requester, itemId, input, idempotencyKey) {
    return requester(
      `/giveaway-items/${encodeURIComponent(itemId)}/reservations`,
      { method: "POST", body: input, idempotencyKey },
    );
  },
  remove(requester, itemId) {
    return requester(`/giveaway-items/${encodeURIComponent(itemId)}/remove`, {
      method: "POST",
      body: {},
    });
  },
  reservations(requester, filters = {}) {
    return requester(`/giveaway-reservations/mine${queryString(filters)}`);
  },
  confirm(requester, reservationId, idempotencyKey) {
    return requester(
      `/giveaway-reservations/${encodeURIComponent(reservationId)}/confirm`,
      { method: "POST", body: {}, idempotencyKey },
    );
  },
  cancel(requester, reservationId) {
    return requester(
      `/giveaway-reservations/${encodeURIComponent(reservationId)}/cancel`,
      { method: "POST", body: {} },
    );
  },
});

export function giveawayOperationKey(operation, resourceId = "new") {
  return `${operation}:${resourceId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;
}
