import { clientConfig } from "../../config/env";
import { Platform } from "react-native";

export class ApiError extends Error {
  constructor({ code, message, status = 0, details, requestId, cause }) {
    super(message, cause ? { cause } : undefined);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.requestId = requestId;
  }
}

function buildUrl(path) {
  const relativePath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(relativePath, `${clientConfig.apiUrl}/`).toString();
}

function parseResponseBody(text, requestId) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ApiError({
      code: "INVALID_API_RESPONSE",
      message: "The server returned an unreadable response.",
      requestId,
      cause: error,
    });
  }
}

export async function apiRequest(
  path,
  {
    method = "GET",
    accessToken,
    body,
    rawBody,
    responseType,
    headers: suppliedHeaders,
    idempotencyKey,
    signal,
    timeoutMs = clientConfig.requestTimeoutMs,
  } = {},
) {
  const controller = new AbortController();
  const headers = new Headers(suppliedHeaders);
  let timedOut = false;

  headers.set("Accept", "application/json");

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  if (idempotencyKey) {
    headers.set("Idempotency-Key", idempotencyKey);
  }

  if (body !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  if (body !== undefined && rawBody !== undefined) {
    throw new Error("A request cannot have both JSON and binary bodies");
  }

  const abortFromCaller = () => controller.abort();

  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const requestFetch =
      Platform.OS !== "web" &&
      (rawBody !== undefined || responseType === "blob")
        ? (await import("expo/fetch")).fetch
        : fetch;
    const response = await requestFetch(buildUrl(path), {
      method,
      headers,
      body:
        rawBody !== undefined
          ? rawBody
          : body === undefined
            ? undefined
            : JSON.stringify(body),
      credentials: "include",
      signal: controller.signal,
    });
    const requestId = response.headers.get("x-request-id") || undefined;
    if (responseType === "blob" && response.ok) return await response.blob();
    const payload = parseResponseBody(await response.text(), requestId);

    if (!response.ok || payload?.success === false) {
      throw new ApiError({
        code: payload?.error?.code || "REQUEST_FAILED",
        message:
          payload?.error?.message || "The request could not be completed.",
        status: response.status,
        details: payload?.error?.details,
        requestId,
      });
    }

    if (response.status === 204) {
      return null;
    }

    if (payload?.success !== true) {
      throw new ApiError({
        code: "INVALID_API_RESPONSE",
        message: "The server returned an unexpected response.",
        status: response.status,
        requestId,
      });
    }

    return payload.data;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error?.name === "AbortError") {
      throw new ApiError({
        code: timedOut ? "REQUEST_TIMEOUT" : "REQUEST_CANCELLED",
        message: timedOut
          ? "The request timed out. Check your connection and try again."
          : "The request was cancelled.",
        cause: error,
      });
    }

    throw new ApiError({
      code: "NETWORK_ERROR",
      message: "Unable to reach SolveOne. Check your connection and try again.",
      cause: error,
    });
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
}

export function isRetryableReadError(error) {
  return (
    error instanceof ApiError &&
    (error.status === 0 ||
      error.status === 408 ||
      error.status === 429 ||
      error.status >= 500)
  );
}
