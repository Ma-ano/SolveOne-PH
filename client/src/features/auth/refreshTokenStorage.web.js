export const usesCookieRefresh = true;

export async function getRefreshToken() {
  return null;
}

export async function setRefreshToken() {
  // Web refresh tokens are intentionally inaccessible to JavaScript.
}

export async function clearRefreshToken() {
  // The API clears the HttpOnly refresh cookie during logout.
}
