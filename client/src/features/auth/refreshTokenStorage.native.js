import * as SecureStore from "expo-secure-store";

const refreshTokenKey = "solveone.refresh-token.v1";

export const usesCookieRefresh = false;

export function getRefreshToken() {
  return SecureStore.getItemAsync(refreshTokenKey);
}

export function setRefreshToken(token) {
  if (!token) {
    return SecureStore.deleteItemAsync(refreshTokenKey);
  }

  return SecureStore.setItemAsync(refreshTokenKey, token, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export function clearRefreshToken() {
  return SecureStore.deleteItemAsync(refreshTokenKey);
}
