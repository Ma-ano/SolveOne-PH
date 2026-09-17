import { apiRequest } from "../../services/api/client";

export const impactApi = Object.freeze({
  platform() {
    return apiRequest("/impact");
  },
  user(userId) {
    return apiRequest(`/impact/users/${encodeURIComponent(userId)}`);
  },
});
