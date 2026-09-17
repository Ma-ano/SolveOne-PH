import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import { validateRequest } from "../src/middleware/validateRequest.js";
import { AppError } from "../src/utils/AppError.js";

const middleware = validateRequest({
  body: z
    .object({
      title: z.string().trim().min(3).max(20),
    })
    .strict(),
});

describe("validateRequest", () => {
  it("stores parsed, normalized input separately from the raw request", () => {
    const req = { body: { title: "  A valid title  " } };
    const next = vi.fn();

    middleware(req, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.validated).toEqual({ body: { title: "A valid title" } });
  });

  it("rejects unknown fields with safe field details", () => {
    const req = { body: { title: "Valid title", role: "admin" } };
    const next = vi.fn();

    middleware(req, {}, next);

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details[0].field).toBe("body");
  });
});
