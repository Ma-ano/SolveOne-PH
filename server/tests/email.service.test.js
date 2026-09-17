import { describe, expect, it, vi } from "vitest";

import { createEmailService } from "../src/services/email.service.js";
import { authTestConfig } from "./helpers/createAuthFixture.js";

describe("email service", () => {
  it("does not log recipient addresses, links, or one-time tokens in console mode", async () => {
    const logger = { info: vi.fn() };
    const service = createEmailService(
      { ...authTestConfig, emailProvider: "console" },
      logger,
    );

    await service.sendEmailVerification({
      to: "private@example.com",
      firstName: "Maria",
      token: "secret-verification-token",
    });

    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).toContain("email_verification");
    expect(logged).not.toContain("private@example.com");
    expect(logged).not.toContain("secret-verification-token");
  });

  it("delivers through the configured provider without logging message content", async () => {
    const logger = { info: vi.fn() };
    const fetchImplementation = vi.fn().mockResolvedValue({ ok: true });
    const service = createEmailService(
      {
        ...authTestConfig,
        emailProvider: "resend",
        emailApiKey: "provider-secret",
        emailFrom: "help@solveone.example",
      },
      logger,
      fetchImplementation,
    );

    await service.sendPasswordReset({
      to: "private@example.com",
      firstName: "<Maria>",
      token: "reset-token",
    });

    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({ method: "POST" }),
    );
    const request = fetchImplementation.mock.calls[0][1];
    expect(request.headers.Authorization).toBe("Bearer provider-secret");
    expect(request.body).toContain("reset-token");
    expect(request.body).toContain("&lt;Maria&gt;");
    expect(logger.info).not.toHaveBeenCalled();
  });

  it("uses a generic error when the provider rejects delivery", async () => {
    const service = createEmailService(
      {
        ...authTestConfig,
        emailProvider: "resend",
        emailApiKey: "provider-secret",
        emailFrom: "help@solveone.example",
      },
      { info: vi.fn() },
      vi.fn().mockResolvedValue({ ok: false }),
    );

    await expect(
      service.sendPasswordReset({
        to: "private@example.com",
        firstName: "Maria",
        token: "reset-token",
      }),
    ).rejects.toThrow("Transactional email provider rejected delivery");
  });
});
