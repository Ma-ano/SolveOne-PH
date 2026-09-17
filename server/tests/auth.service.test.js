import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";

import {
  createAuthFixture,
  registerAndVerify,
  validRegistration,
} from "./helpers/createAuthFixture.js";

const context = {
  ipAddress: "203.0.113.10",
  deviceName: "Test phone",
  platform: "android",
};

async function expectAuthError(promise, code, statusCode) {
  await expect(promise).rejects.toMatchObject({ code, statusCode });
}

describe("AuthService", () => {
  it("registers only a normal user, normalizes email, hashes the password, and records consent", async () => {
    const fixture = createAuthFixture();
    const result = await fixture.authService.register({
      ...validRegistration,
      role: "admin",
    });
    const storedUser = [...fixture.repository.users.values()][0];

    expect(result.user).toMatchObject({
      email: "maria.santos@example.com",
      role: "user",
      emailVerified: false,
      verificationLevel: "UNVERIFIED",
    });
    expect(result.user).not.toHaveProperty("passwordHash");
    expect(storedUser.emailNormalized).toBe("maria.santos@example.com");
    expect(storedUser.passwordHash).not.toBe(validRegistration.password);
    expect(
      await bcrypt.compare(validRegistration.password, storedUser.passwordHash),
    ).toBe(true);
    expect(storedUser.agreements).toMatchObject({
      termsVersion: "2026-09-14",
      privacyVersion: "2026-09-14",
    });
    expect(fixture.sentEmails.verification).toHaveLength(1);
    expect(fixture.repository.authTokens[0].tokenHash).not.toBe(
      fixture.sentEmails.verification[0].token,
    );
  });

  it("rejects duplicate normalized email addresses", async () => {
    const fixture = createAuthFixture();
    await fixture.authService.register(validRegistration);

    await expectAuthError(
      fixture.authService.register({
        ...validRegistration,
        email: "  MARIA.SANTOS@example.com ",
      }),
      "EMAIL_ALREADY_REGISTERED",
      409,
    );
  });

  it("verifies an email token exactly once", async () => {
    const fixture = createAuthFixture();
    await fixture.authService.register(validRegistration);
    const token = fixture.sentEmails.verification[0].token;

    const result = await fixture.authService.verifyEmail(token);
    expect(result.user).toMatchObject({
      emailVerified: true,
      verificationLevel: "EMAIL_VERIFIED",
    });
    await expectAuthError(
      fixture.authService.verifyEmail(token),
      "EMAIL_VERIFICATION_TOKEN_INVALID",
      400,
    );
  });

  it("uses generic credential errors and blocks unverified or suspended accounts", async () => {
    const fixture = createAuthFixture();
    await fixture.authService.register(validRegistration);

    await expectAuthError(
      fixture.authService.login(
        {
          email: validRegistration.email,
          password: validRegistration.password,
          ...context,
        },
        context,
      ),
      "EMAIL_VERIFICATION_REQUIRED",
      403,
    );
    await fixture.authService.verifyEmail(
      fixture.sentEmails.verification[0].token,
    );
    await expectAuthError(
      fixture.authService.login(
        {
          email: "unknown@example.com",
          password: "wrong-password",
          ...context,
        },
        context,
      ),
      "INVALID_CREDENTIALS",
      401,
    );
    expect(fixture.repository.securityEvents.at(-1)).toMatchObject({
      userId: null,
      type: "login_failed",
    });

    const storedUser = [...fixture.repository.users.values()][0];
    storedUser.accountStatus = "suspended";
    await expectAuthError(
      fixture.authService.login(
        {
          email: validRegistration.email,
          password: validRegistration.password,
          ...context,
        },
        context,
      ),
      "ACCOUNT_UNAVAILABLE",
      403,
    );
  });

  it("rotates refresh tokens and revokes the whole family when an old token is reused", async () => {
    const fixture = createAuthFixture();
    await registerAndVerify(fixture);
    const login = await fixture.authService.login(
      {
        email: validRegistration.email,
        password: validRegistration.password,
        ...context,
      },
      context,
    );
    const rotated = await fixture.authService.refresh(
      login.refreshToken,
      context,
    );

    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    await expect(
      fixture.authService.authenticateAccessToken(rotated.accessToken),
    ).resolves.toMatchObject({
      role: "user",
    });
    await expectAuthError(
      fixture.authService.refresh(login.refreshToken, context),
      "REFRESH_TOKEN_REUSE_DETECTED",
      401,
    );
    await expectAuthError(
      fixture.authService.authenticateAccessToken(rotated.accessToken),
      "AUTH_REQUIRED",
      401,
    );
    expect(fixture.repository.securityEvents.at(-1).type).toBe(
      "refresh_token_reuse",
    );
  });

  it("logs out one session idempotently and supports logout from all devices", async () => {
    const fixture = createAuthFixture();
    await registerAndVerify(fixture);
    const first = await fixture.authService.login(
      {
        email: validRegistration.email,
        password: validRegistration.password,
        ...context,
      },
      context,
    );
    const second = await fixture.authService.login(
      {
        email: validRegistration.email,
        password: validRegistration.password,
        ...context,
      },
      context,
    );

    await fixture.authService.logout({
      refreshToken: "not-a-token",
      accessToken: first.accessToken,
    });
    await expectAuthError(
      fixture.authService.authenticateAccessToken(first.accessToken),
      "AUTH_REQUIRED",
      401,
    );
    await expect(
      fixture.authService.authenticateAccessToken(second.accessToken),
    ).resolves.toBeTruthy();

    const userId = fixture.tokenService.verifyAccessToken(
      second.accessToken,
    ).sub;
    await fixture.authService.logoutAll(userId);
    await expectAuthError(
      fixture.authService.authenticateAccessToken(second.accessToken),
      "AUTH_REQUIRED",
      401,
    );
  });

  it("keeps password recovery enumeration-resistant, one-time, and session-revoking", async () => {
    const fixture = createAuthFixture();
    await registerAndVerify(fixture);
    const login = await fixture.authService.login(
      {
        email: validRegistration.email,
        password: validRegistration.password,
        ...context,
      },
      context,
    );

    const unknown =
      await fixture.authService.forgotPassword("nobody@example.com");
    const known = await fixture.authService.forgotPassword(
      validRegistration.email,
    );
    expect(known).toEqual(unknown);
    expect(fixture.sentEmails.passwordReset).toHaveLength(1);

    const resetToken = fixture.sentEmails.passwordReset[0].token;
    await fixture.authService.resetPassword(
      { token: resetToken, password: "a-new-safe-password-456" },
      context,
    );
    await expectAuthError(
      fixture.authService.resetPassword(
        { token: resetToken, password: "another-safe-password-789" },
        context,
      ),
      "PASSWORD_RESET_TOKEN_INVALID",
      400,
    );
    await expectAuthError(
      fixture.authService.authenticateAccessToken(login.accessToken),
      "AUTH_REQUIRED",
      401,
    );
    await expect(
      fixture.authService.login(
        {
          email: validRegistration.email,
          password: "a-new-safe-password-456",
          ...context,
        },
        context,
      ),
    ).resolves.toHaveProperty("accessToken");
  });

  it("blocks account closure until active commitments are resolved", async () => {
    const fixture = createAuthFixture();
    const registered = await registerAndVerify(fixture);
    fixture.repository.accountClosureBlockers = [
      "help_offers",
      "giveaway_reservations",
    ];

    await expectAuthError(
      fixture.authService.closeAccount(
        registered.id,
        {
          password: validRegistration.password,
          confirmation: "CLOSE MY ACCOUNT",
          retentionAcknowledged: true,
          policyVersion: "2026-09-18",
        },
        context,
      ),
      "ACCOUNT_CLOSURE_BLOCKED",
      409,
    );
    expect(fixture.repository.users.get(registered.id).accountStatus).toBe(
      "active",
    );
  });

  it("anonymizes a normal account and revokes all authentication material", async () => {
    const fixture = createAuthFixture();
    const registered = await registerAndVerify(fixture);
    const first = await fixture.authService.login(
      {
        email: validRegistration.email,
        password: validRegistration.password,
        ...context,
      },
      context,
    );
    const second = await fixture.authService.login(
      {
        email: validRegistration.email,
        password: validRegistration.password,
        ...context,
      },
      context,
    );

    const requirements = await fixture.authService.accountClosureRequirements(
      registered.id,
    );
    expect(requirements).toMatchObject({
      eligible: true,
      blockers: [],
      policyVersion: "2026-09-18",
    });

    const result = await fixture.authService.closeAccount(
      registered.id,
      {
        password: validRegistration.password,
        confirmation: "CLOSE MY ACCOUNT",
        retentionAcknowledged: true,
        policyVersion: "2026-09-18",
      },
      context,
    );
    const stored = fixture.repository.users.get(registered.id);

    expect(result).toMatchObject({ message: "Account closed" });
    expect(stored).toMatchObject({
      firstName: "Closed",
      lastName: "Account",
      accountStatus: "disabled",
      emailVerified: false,
      accountClosurePolicyVersion: "2026-09-18",
      bio: null,
      skills: [],
      verification: { level: "UNVERIFIED" },
    });
    expect(stored.email).toMatch(/^closed\+[0-9a-f-]{36}@deleted\.invalid$/);
    expect(stored.emailNormalized).toBe(stored.email);
    expect(
      await bcrypt.compare(validRegistration.password, stored.passwordHash),
    ).toBe(false);
    expect(fixture.repository.identityClosureUpdates).toHaveLength(1);
    expect(fixture.repository.securityEvents.at(-1)).toMatchObject({
      userId: registered.id,
      type: "account_closed",
      metadata: { policyVersion: "2026-09-18" },
    });
    await expectAuthError(
      fixture.authService.authenticateAccessToken(first.accessToken),
      "AUTH_REQUIRED",
      401,
    );
    await expectAuthError(
      fixture.authService.authenticateAccessToken(second.accessToken),
      "AUTH_REQUIRED",
      401,
    );

    await expect(
      fixture.authService.register(validRegistration),
    ).resolves.toHaveProperty("user.email", "maria.santos@example.com");
  });

  it("requires the current closure notice, password, and normal-user role", async () => {
    const fixture = createAuthFixture();
    const registered = await registerAndVerify(fixture);

    await expectAuthError(
      fixture.authService.closeAccount(
        registered.id,
        {
          password: validRegistration.password,
          confirmation: "CLOSE MY ACCOUNT",
          retentionAcknowledged: true,
          policyVersion: "old-policy",
        },
        context,
      ),
      "ACCOUNT_CLOSURE_NOTICE_CHANGED",
      409,
    );
    await expectAuthError(
      fixture.authService.closeAccount(
        registered.id,
        {
          password: "wrong-password",
          confirmation: "CLOSE MY ACCOUNT",
          retentionAcknowledged: true,
          policyVersion: "2026-09-18",
        },
        context,
      ),
      "INVALID_CREDENTIALS",
      401,
    );

    fixture.repository.users.get(registered.id).role = "moderator";
    const requirements = await fixture.authService.accountClosureRequirements(
      registered.id,
    );
    expect(requirements).toMatchObject({
      eligible: false,
      blockers: ["staff_account"],
    });
    await expectAuthError(
      fixture.authService.closeAccount(
        registered.id,
        {
          password: validRegistration.password,
          confirmation: "CLOSE MY ACCOUNT",
          retentionAcknowledged: true,
          policyVersion: "2026-09-18",
        },
        context,
      ),
      "ACCOUNT_CLOSURE_FORBIDDEN",
      403,
    );
  });
});
