const developmentApiUrl = "http://localhost:5000/api/v1";
const isDevelopment = typeof __DEV__ !== "undefined" && __DEV__;

function readApiUrl() {
  const value =
    process.env.EXPO_PUBLIC_API_URL?.trim() ||
    (isDevelopment ? developmentApiUrl : "");

  if (!value) {
    throw new Error("EXPO_PUBLIC_API_URL is required for production builds");
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("EXPO_PUBLIC_API_URL must be a valid HTTP URL");
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("EXPO_PUBLIC_API_URL must use HTTP or HTTPS");
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      "EXPO_PUBLIC_API_URL must not contain credentials, query, or fragment",
    );
  }

  if (!isDevelopment && url.protocol !== "https:") {
    throw new Error("EXPO_PUBLIC_API_URL must use HTTPS outside development");
  }

  const normalizedPath = url.pathname.replace(/\/+$/, "");

  if (normalizedPath !== "/api/v1") {
    throw new Error("EXPO_PUBLIC_API_URL must end with /api/v1");
  }

  url.pathname = normalizedPath;
  return url.toString().replace(/\/$/, "");
}

const apiUrl = readApiUrl();
const realtimeUrl = new URL(apiUrl);
realtimeUrl.pathname = realtimeUrl.pathname.replace(/\/api\/v1$/, "");

export const clientConfig = Object.freeze({
  apiUrl,
  realtimeUrl: realtimeUrl.toString().replace(/\/$/, ""),
  requestTimeoutMs: 10000,
});
