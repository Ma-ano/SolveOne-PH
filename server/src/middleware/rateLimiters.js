import rateLimit from "express-rate-limit";

function rateLimitHandler(req, res) {
  res.status(429).json({
    success: false,
    error: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please try again later.",
    },
  });
}

export function createGlobalRateLimiter({ windowMs, limit }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => req.path === "/health",
    handler: rateLimitHandler,
  });
}

export function createScopedRateLimiter({ windowMs, limit, keyGenerator }) {
  return rateLimit({
    windowMs,
    limit,
    ...(keyGenerator ? { keyGenerator } : {}),
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler,
  });
}
