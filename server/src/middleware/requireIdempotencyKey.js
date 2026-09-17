import { AppError } from "../utils/AppError.js";

const keyPattern = /^[A-Za-z0-9._:-]{16,200}$/;

export function requireIdempotencyKey(req, res, next) {
  const key = req.get("idempotency-key")?.trim();
  if (!key || !keyPattern.test(key)) {
    next(
      new AppError({
        statusCode: 400,
        code: "IDEMPOTENCY_KEY_REQUIRED",
        message:
          "A valid Idempotency-Key header is required for this operation",
      }),
    );
    return;
  }
  req.idempotencyKey = key;
  next();
}
