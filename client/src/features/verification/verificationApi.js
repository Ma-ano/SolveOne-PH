function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const verificationApi = Object.freeze({
  requirements(request) {
    return request("/verifications/identity/requirements");
  },
  mine(request) {
    return request("/verifications/identity/me");
  },
  upload(request, bytes, mimeType, noticeVersion) {
    return request("/verifications/identity/uploads", {
      method: "POST",
      rawBody: bytes,
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Identity-Mime-Type": mimeType,
        "X-Identity-Acknowledged": "true",
        "X-Identity-Notice-Version": noticeVersion,
      },
    });
  },
  submit(request, uploadIds) {
    return request("/verifications/identity/submit", {
      method: "POST",
      body: { uploadIds, acknowledged: true },
    });
  },
  queue(request, filters = {}) {
    return request(`/admin/verifications/identity${queryString(filters)}`);
  },
  claim(request, recordId) {
    return request(
      `/admin/verifications/identity/${encodeURIComponent(recordId)}/claim`,
      {
        method: "POST",
        body: {},
      },
    );
  },
  document(request, recordId, uploadId) {
    return request(
      `/admin/verifications/identity/${encodeURIComponent(recordId)}/documents/${encodeURIComponent(uploadId)}`,
      { responseType: "blob" },
    );
  },
  decide(request, recordId, decision, reason) {
    return request(
      `/admin/verifications/identity/${encodeURIComponent(recordId)}/${decision}`,
      { method: "POST", body: decision === "reject" ? { reason } : {} },
    );
  },
});
