import { describe, expect, it, vi } from "vitest";

import { requireRole } from "../src/middleware/requireRole.js";

describe("requireRole", () => {
  it("allows an authenticated role on the route allow-list", () => {
    const next = vi.fn();
    requireRole("moderator", "admin")(
      { auth: { role: "moderator" } },
      {},
      next,
    );

    expect(next).toHaveBeenCalledWith();
  });

  it("rejects a normal user without leaking route details", () => {
    const next = vi.fn();
    requireRole("admin")({ auth: { role: "user" } }, {}, next);

    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  it("requires authentication before evaluating a role", () => {
    const next = vi.fn();
    requireRole("admin")({}, {}, next);

    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 401,
      code: "AUTH_REQUIRED",
    });
  });

  it("fails at startup when configured with an unknown role", () => {
    expect(() => requireRole("owner")).toThrow(
      "requireRole needs at least one valid user role",
    );
  });
});
