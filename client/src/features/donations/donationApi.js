function queryString(values) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "")
      params.set(key, String(value));
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const donationApi = Object.freeze({
  checkout(request, amountCentavos, idempotencyKey) {
    return request("/platform-donations/checkout", {
      method: "POST",
      body: { amountCentavos },
      idempotencyKey,
    });
  },
  history(request, filters = {}) {
    return request(`/platform-donations/me${queryString(filters)}`);
  },
  dashboard(request) {
    return request("/admin/platform-donations/dashboard");
  },
});

export function donationOperationKey() {
  return `donation:${Date.now()}:${Math.random().toString(36).slice(2)}:${Math.random().toString(36).slice(2)}`;
}
