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

export const offerApi = Object.freeze({
  create(authenticatedRequest, requestId, input) {
    return authenticatedRequest(
      `/requests/${encodeURIComponent(requestId)}/offers`,
      { method: "POST", body: input },
    );
  },

  listMine(authenticatedRequest, filters = {}) {
    return authenticatedRequest(`/offers/me${queryString(filters)}`);
  },

  listForRequest(authenticatedRequest, requestId, filters = {}) {
    return authenticatedRequest(
      `/requests/${encodeURIComponent(requestId)}/offers${queryString(filters)}`,
    );
  },

  transition(authenticatedRequest, offerId, operation, idempotencyKey) {
    return authenticatedRequest(
      `/offers/${encodeURIComponent(offerId)}/${operation}`,
      { method: "POST", body: {}, idempotencyKey },
    );
  },

  complete(authenticatedRequest, offerId, input) {
    return authenticatedRequest(
      `/offers/${encodeURIComponent(offerId)}/complete`,
      { method: "POST", body: input },
    );
  },

  evidence(authenticatedRequest, offerId) {
    return authenticatedRequest(
      `/offers/${encodeURIComponent(offerId)}/evidence`,
    );
  },

  confirm(authenticatedRequest, offerId, idempotencyKey) {
    return authenticatedRequest(
      `/offers/${encodeURIComponent(offerId)}/confirm`,
      { method: "POST", body: {}, idempotencyKey },
    );
  },

  dispute(authenticatedRequest, offerId, reason) {
    return authenticatedRequest(
      `/offers/${encodeURIComponent(offerId)}/dispute`,
      { method: "POST", body: { reason } },
    );
  },

  uploadFile(authenticatedRequest, offerId, { bytes, name, mimeType }) {
    return authenticatedRequest(
      `/offers/${encodeURIComponent(offerId)}/evidence/uploads`,
      {
        method: "POST",
        rawBody: bytes,
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Evidence-Name": encodeURIComponent(name),
          "X-Evidence-Mime-Type": mimeType,
        },
      },
    );
  },

  downloadFile(authenticatedRequest, offerId, fileId) {
    return authenticatedRequest(
      `/offers/${encodeURIComponent(offerId)}/evidence/files/${encodeURIComponent(fileId)}`,
      { responseType: "blob" },
    );
  },
});

export function createOfferOperationKey(operation, offerId) {
  return `${operation}:${offerId}:${Date.now()}:${Math.random()
    .toString(36)
    .slice(2)}`;
}
