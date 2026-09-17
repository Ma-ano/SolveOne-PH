import { AppError } from "../utils/AppError.js";

export function notFound(req, res, next) {
  next(
    new AppError({
      statusCode: 404,
      code: "ROUTE_NOT_FOUND",
      message: "Route not found",
    }),
  );
}

function normalizeError(error) {
  if (error instanceof AppError) {
    return error;
  }

  if (error?.type === "entity.too.large") {
    return new AppError({
      statusCode: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "Request body is too large",
      cause: error,
    });
  }

  if (error instanceof SyntaxError && error.status === 400 && "body" in error) {
    return new AppError({
      statusCode: 400,
      code: "INVALID_JSON",
      message: "Request body contains invalid JSON",
      cause: error,
    });
  }

  return new AppError({
    statusCode: 500,
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
    cause: error,
  });
}

export function errorHandler(environment) {
  return function handleError(error, req, res, next) {
    if (res.headersSent) {
      next(error);
      return;
    }

    const normalized = normalizeError(error);
    const isUnexpected = normalized.statusCode >= 500;
    const logContext = {
      requestId: req.id,
      errorCode: normalized.code,
      errorName: error?.name ?? "Error",
    };

    if (isUnexpected) {
      if (environment !== "production") {
        logContext.errorMessage = error?.message;
        logContext.stack = error?.stack;
      }
      req.log?.error(logContext, "Request failed unexpectedly");
    } else {
      req.log?.warn(logContext, "Request rejected");
    }

    const errorBody = {
      code: normalized.code,
      message: normalized.message,
    };

    if (normalized.details) {
      errorBody.details = normalized.details;
    }

    res.status(normalized.statusCode).json({
      success: false,
      error: errorBody,
    });
  };
}
