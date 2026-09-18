import { Platform } from "react-native";

import { apiRequest } from "../../services/api/client";

function deviceContext() {
  const platform = ["android", "ios", "web"].includes(Platform.OS)
    ? Platform.OS
    : "unknown";

  return {
    platform,
    deviceName: platform === "web" ? "Web browser" : `${platform} device`,
  };
}

export const authApi = Object.freeze({
  register(input) {
    return apiRequest("/auth/register", { method: "POST", body: input });
  },

  login(input) {
    return apiRequest("/auth/login", {
      method: "POST",
      body: { ...input, ...deviceContext() },
    });
  },

  verifyEmail(token) {
    return apiRequest("/auth/verify-email", {
      method: "POST",
      body: { token },
    });
  },

  resendVerification(email) {
    return apiRequest("/auth/resend-verification", {
      method: "POST",
      body: { email },
    });
  },

  forgotPassword(email) {
    return apiRequest("/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
  },

  resetPassword(input) {
    return apiRequest("/auth/reset-password", {
      method: "POST",
      body: input,
    });
  },

  refresh(refreshToken) {
    return apiRequest("/auth/refresh", {
      method: "POST",
      body: {
        ...(refreshToken ? { refreshToken } : {}),
        ...deviceContext(),
      },
    });
  },

  restoreSession() {
    return apiRequest("/auth/session", {
      method: "POST",
      body: deviceContext(),
    });
  },

  logout({ accessToken, refreshToken }) {
    return apiRequest("/auth/logout", {
      method: "POST",
      accessToken,
      body: refreshToken ? { refreshToken } : {},
    });
  },

  logoutAll(accessToken) {
    return apiRequest("/auth/logout-all", {
      method: "POST",
      accessToken,
      body: {},
    });
  },
});
