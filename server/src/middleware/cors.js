import { AppError } from "../utils/AppError.js";

export function createCorsOptions(allowedOrigins) {
  const allowlist = new Set(allowedOrigins);

  return {
    origin(origin, callback) {
      if (!origin || allowlist.has(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new AppError({
          statusCode: 403,
          code: "CORS_ORIGIN_DENIED",
          message: "Origin is not allowed",
        }),
      );
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Idempotency-Key",
      "X-Request-Id",
    ],
    exposedHeaders: [
      "X-Request-Id",
      "RateLimit-Limit",
      "RateLimit-Remaining",
      "RateLimit-Reset",
    ],
    maxAge: 600,
  };
}
