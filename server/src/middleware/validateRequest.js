import { z } from "zod";

import { AppError } from "../utils/AppError.js";

export function validateRequest(schemas) {
  const sectionEntries = Object.entries(schemas).filter(([section]) =>
    ["params", "query", "body"].includes(section),
  );
  const requestSchema =
    schemas.root ?? z.object(Object.fromEntries(sectionEntries)).strict();

  return function requestValidation(req, res, next) {
    const input = Object.fromEntries(
      sectionEntries.map(([section]) => [section, req[section]]),
    );
    const result = requestSchema.safeParse(input);

    if (!result.success) {
      next(
        new AppError({
          statusCode: 422,
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: result.error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        }),
      );
      return;
    }

    req.validated = result.data;
    next();
  };
}
