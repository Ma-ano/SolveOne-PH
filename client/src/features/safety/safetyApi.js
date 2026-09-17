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

export const safetyApi = Object.freeze({
  reportUser(authenticatedRequest, userId, input) {
    return authenticatedRequest(
      `/reports/users/${encodeURIComponent(userId)}`,
      {
        method: "POST",
        body: input,
      },
    );
  },
  reportRequest(authenticatedRequest, requestId, input) {
    return authenticatedRequest(
      `/reports/requests/${encodeURIComponent(requestId)}`,
      { method: "POST", body: input },
    );
  },
  reportGiveaway(authenticatedRequest, itemId, input) {
    return authenticatedRequest(
      `/reports/giveaway-items/${encodeURIComponent(itemId)}`,
      { method: "POST", body: input },
    );
  },
  reportMission(authenticatedRequest, missionId, input) {
    return authenticatedRequest(
      `/reports/community-missions/${encodeURIComponent(missionId)}`,
      { method: "POST", body: input },
    );
  },
  blockUser(authenticatedRequest, userId) {
    return authenticatedRequest(`/blocks/${encodeURIComponent(userId)}`, {
      method: "POST",
      body: {},
    });
  },
  unblockUser(authenticatedRequest, userId) {
    return authenticatedRequest(`/blocks/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    });
  },
  listBlocks(authenticatedRequest, filters = {}) {
    return authenticatedRequest(`/blocks${queryString(filters)}`);
  },
  listReports(authenticatedRequest, filters = {}) {
    return authenticatedRequest(`/admin/safety/reports${queryString(filters)}`);
  },
  claimReport(authenticatedRequest, reportId) {
    return authenticatedRequest(
      `/admin/safety/reports/${encodeURIComponent(reportId)}/claim`,
      { method: "POST", body: {} },
    );
  },
  getReport(authenticatedRequest, reportId) {
    return authenticatedRequest(
      `/admin/safety/reports/${encodeURIComponent(reportId)}`,
    );
  },
  resolveReport(authenticatedRequest, reportId, input) {
    return authenticatedRequest(
      `/admin/safety/reports/${encodeURIComponent(reportId)}/resolve`,
      { method: "POST", body: input },
    );
  },
  suspendUser(authenticatedRequest, userId, reason) {
    return authenticatedRequest(
      `/admin/safety/users/${encodeURIComponent(userId)}/suspend`,
      { method: "POST", body: { reason } },
    );
  },
  reinstateUser(authenticatedRequest, userId, reason) {
    return authenticatedRequest(
      `/admin/safety/users/${encodeURIComponent(userId)}/reinstate`,
      { method: "POST", body: { reason } },
    );
  },
  listAuditLogs(authenticatedRequest, filters = {}) {
    return authenticatedRequest(
      `/admin/safety/audit-logs${queryString(filters)}`,
    );
  },
});
