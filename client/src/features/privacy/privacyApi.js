function queryString(filters) {
  const query = new URLSearchParams(
    Object.entries(filters).filter(
      ([, value]) => value !== undefined && value !== "",
    ),
  ).toString();
  return query ? `?${query}` : "";
}

export const privacyApi = Object.freeze({
  submit(authenticatedRequest, input) {
    return authenticatedRequest("/privacy-requests", {
      method: "POST",
      body: input,
    });
  },
  listOwn(authenticatedRequest, filters = {}) {
    return authenticatedRequest(`/privacy-requests${queryString(filters)}`);
  },
  getOwn(authenticatedRequest, requestId) {
    return authenticatedRequest(
      `/privacy-requests/${encodeURIComponent(requestId)}`,
    );
  },
  cancel(authenticatedRequest, requestId) {
    return authenticatedRequest(
      `/privacy-requests/${encodeURIComponent(requestId)}/cancel`,
      { method: "POST", body: {} },
    );
  },
  listAdmin(authenticatedRequest, filters = {}) {
    return authenticatedRequest(
      `/admin/privacy-requests${queryString(filters)}`,
    );
  },
  getAdmin(authenticatedRequest, requestId) {
    return authenticatedRequest(
      `/admin/privacy-requests/${encodeURIComponent(requestId)}`,
    );
  },
  claim(authenticatedRequest, requestId) {
    return authenticatedRequest(
      `/admin/privacy-requests/${encodeURIComponent(requestId)}/claim`,
      { method: "POST", body: {} },
    );
  },
  release(authenticatedRequest, requestId) {
    return authenticatedRequest(
      `/admin/privacy-requests/${encodeURIComponent(requestId)}/release`,
      { method: "POST", body: {} },
    );
  },
  resolve(authenticatedRequest, requestId, input) {
    return authenticatedRequest(
      `/admin/privacy-requests/${encodeURIComponent(requestId)}/resolve`,
      { method: "POST", body: input },
    );
  },
});
