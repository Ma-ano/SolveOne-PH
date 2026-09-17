import { apiRequest } from "../../services/api/client";

export const profileApi = Object.freeze({
  getPrivateProfile(authenticatedRequest) {
    return authenticatedRequest("/users/me");
  },

  updatePrivateProfile(authenticatedRequest, input) {
    return authenticatedRequest("/users/me", {
      method: "PATCH",
      body: input,
    });
  },

  getAccountClosureRequirements(authenticatedRequest) {
    return authenticatedRequest("/auth/account-closure");
  },

  closeAccount(authenticatedRequest, input) {
    return authenticatedRequest("/auth/account-closure", {
      method: "POST",
      body: input,
    });
  },

  getPublicProfile(userId) {
    return apiRequest(`/users/${encodeURIComponent(userId)}`);
  },
});
