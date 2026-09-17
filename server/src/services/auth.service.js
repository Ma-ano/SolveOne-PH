import { randomUUID } from "node:crypto";

import bcrypt from "bcrypt";

import { serializePrivateUser } from "../serializers/user.serializer.js";
import { AppError } from "../utils/AppError.js";
import {
  generateOpaqueToken,
  hashIpAddress,
  hashOpaqueToken,
  safeHashEquals,
} from "../utils/authCrypto.js";
import { normalizeEmail } from "../utils/normalizeEmail.js";

const dummyPasswordHashes = new Map();
const genericEmailResponse = Object.freeze({
  message: "If the account is eligible, an email will arrive shortly.",
});

function getDummyPasswordHash(rounds) {
  if (!dummyPasswordHashes.has(rounds)) {
    dummyPasswordHashes.set(
      rounds,
      bcrypt.hashSync("solveone-nonexistent-account-password", rounds),
    );
  }

  return dummyPasswordHashes.get(rounds);
}

function authError(statusCode, code, message, details) {
  return new AppError({ statusCode, code, message, details });
}

export class AuthService {
  constructor({
    repository,
    tokenService,
    emailService,
    config,
    logger,
    clock = () => new Date(),
  }) {
    this.repository = repository;
    this.tokenService = tokenService;
    this.emailService = emailService;
    this.config = config;
    this.logger = logger;
    this.clock = clock;
    this.dummyPasswordHash = getDummyPasswordHash(config.passwordHashRounds);
  }

  getIpHash(context) {
    return hashIpAddress(
      context?.ipAddress || "unknown",
      this.config.ipHashSecret,
    );
  }

  async deliverVerificationEmail(user, token) {
    try {
      await this.emailService.sendEmailVerification({
        to: user.email,
        firstName: user.firstName,
        token,
      });
      return "sent";
    } catch (error) {
      this.logger.error(
        { userId: String(user._id), errorName: error.name },
        "Email verification delivery failed",
      );
      return "pending";
    }
  }

  async deliverPasswordResetEmail(user, token) {
    try {
      await this.emailService.sendPasswordReset({
        to: user.email,
        firstName: user.firstName,
        token,
      });
    } catch (error) {
      this.logger.error(
        { userId: String(user._id), errorName: error.name },
        "Password reset delivery failed",
      );
    }
  }

  async register(input) {
    const now = this.clock();
    const emailNormalized = normalizeEmail(input.email);
    const passwordHash = await bcrypt.hash(
      input.password,
      this.config.passwordHashRounds,
    );
    const verificationToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(verificationToken);
    let user;

    try {
      await this.repository.withTransaction(async (session) => {
        user = await this.repository.createUser(
          {
            firstName: input.firstName,
            lastName: input.lastName,
            email: emailNormalized,
            emailNormalized,
            passwordHash,
            role: "user",
            accountStatus: "active",
            emailVerified: false,
            verification: { level: "UNVERIFIED" },
            agreements: {
              termsAcceptedAt: now,
              termsVersion: this.config.termsVersion,
              privacyAcceptedAt: now,
              privacyVersion: this.config.privacyVersion,
            },
          },
          session,
        );

        await this.repository.createAuthToken(
          {
            userId: user._id,
            type: "email_verification",
            tokenHash,
            expiresAt: new Date(
              now.getTime() + this.config.emailVerificationTtlMinutes * 60000,
            ),
          },
          session,
        );
      });
    } catch (error) {
      if (error?.code === 11000 && error?.keyPattern?.emailNormalized) {
        throw authError(
          409,
          "EMAIL_ALREADY_REGISTERED",
          "An account already uses this email",
        );
      }
      throw error;
    }

    const verificationEmailStatus = await this.deliverVerificationEmail(
      user,
      verificationToken,
    );

    return {
      user: serializePrivateUser(user),
      verificationEmailStatus,
    };
  }

  async verifyEmail(token) {
    const now = this.clock();
    const tokenHash = hashOpaqueToken(token);
    let user;

    await this.repository.withTransaction(async (session) => {
      const authToken = await this.repository.consumeAuthToken(
        tokenHash,
        "email_verification",
        now,
        session,
      );

      if (!authToken) {
        throw authError(
          400,
          "EMAIL_VERIFICATION_TOKEN_INVALID",
          "Verification link is invalid or expired",
        );
      }

      user = await this.repository.markEmailVerified(
        authToken.userId,
        now,
        session,
      );

      if (!user) {
        user = await this.repository.findUserById(authToken.userId, {
          session,
        });
      }

      await this.repository.invalidateAuthTokens(
        authToken.userId,
        "email_verification",
        now,
        session,
      );
    });

    if (!user) {
      throw authError(
        400,
        "EMAIL_VERIFICATION_TOKEN_INVALID",
        "Verification link is invalid",
      );
    }

    return { user: serializePrivateUser(user) };
  }

  async resendVerification(email) {
    const emailNormalized = normalizeEmail(email);
    const user = await this.repository.findUserByEmail(emailNormalized);

    if (!user || user.emailVerified || user.accountStatus !== "active") {
      return genericEmailResponse;
    }

    const now = this.clock();
    const verificationToken = generateOpaqueToken();

    await this.repository.withTransaction(async (session) => {
      await this.repository.invalidateAuthTokens(
        user._id,
        "email_verification",
        now,
        session,
      );
      await this.repository.createAuthToken(
        {
          userId: user._id,
          type: "email_verification",
          tokenHash: hashOpaqueToken(verificationToken),
          expiresAt: new Date(
            now.getTime() + this.config.emailVerificationTtlMinutes * 60000,
          ),
        },
        session,
      );
    });

    await this.deliverVerificationEmail(user, verificationToken);
    return genericEmailResponse;
  }

  async forgotPassword(email) {
    const user = await this.repository.findUserByEmail(normalizeEmail(email));

    if (!user || user.accountStatus !== "active") {
      return genericEmailResponse;
    }

    const now = this.clock();
    const resetToken = generateOpaqueToken();

    await this.repository.withTransaction(async (session) => {
      await this.repository.invalidateAuthTokens(
        user._id,
        "password_reset",
        now,
        session,
      );
      await this.repository.createAuthToken(
        {
          userId: user._id,
          type: "password_reset",
          tokenHash: hashOpaqueToken(resetToken),
          expiresAt: new Date(
            now.getTime() + this.config.passwordResetTtlMinutes * 60000,
          ),
        },
        session,
      );
    });

    await this.deliverPasswordResetEmail(user, resetToken);
    return genericEmailResponse;
  }

  async resetPassword({ token, password }, context) {
    const now = this.clock();
    const passwordHash = await bcrypt.hash(
      password,
      this.config.passwordHashRounds,
    );
    const tokenHash = hashOpaqueToken(token);

    await this.repository.withTransaction(async (session) => {
      const authToken = await this.repository.consumeAuthToken(
        tokenHash,
        "password_reset",
        now,
        session,
      );

      if (!authToken) {
        throw authError(
          400,
          "PASSWORD_RESET_TOKEN_INVALID",
          "Password reset link is invalid or expired",
        );
      }

      const user = await this.repository.updatePassword(
        authToken.userId,
        passwordHash,
        now,
        session,
      );

      if (!user) {
        throw authError(
          400,
          "PASSWORD_RESET_TOKEN_INVALID",
          "Password reset link is invalid",
        );
      }

      await this.repository.invalidateAuthTokens(
        authToken.userId,
        "password_reset",
        now,
        session,
      );
      await this.repository.revokeAllUserSessions(
        authToken.userId,
        now,
        session,
      );
      await this.repository.createSecurityEvent(
        {
          userId: authToken.userId,
          type: "password_reset_completed",
          ipHash: this.getIpHash(context),
        },
        session,
      );
    });

    return {
      message: "Password reset successfully. Sign in with your new password.",
    };
  }

  async login({ email, password, deviceName, platform }, context) {
    const user = await this.repository.findUserByEmail(normalizeEmail(email), {
      includePassword: true,
    });
    const passwordMatches = await bcrypt.compare(
      password,
      user?.passwordHash || this.dummyPasswordHash,
    );

    if (!user || !passwordMatches) {
      await this.repository.createSecurityEvent({
        userId: user?._id ?? null,
        type: "login_failed",
        ipHash: this.getIpHash(context),
      });
      throw authError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect",
      );
    }

    if (user.accountStatus !== "active") {
      throw authError(
        403,
        "ACCOUNT_UNAVAILABLE",
        "This account is unavailable",
      );
    }

    if (!user.emailVerified) {
      throw authError(
        403,
        "EMAIL_VERIFICATION_REQUIRED",
        "Verify your email before signing in",
      );
    }

    return this.createSession(user, { ...context, deviceName, platform });
  }

  async createSession(user, context) {
    const now = this.clock();
    const sessionId = randomUUID();
    const familyId = randomUUID();
    const refreshToken = this.tokenService.issueRefreshToken({
      userId: user._id,
      sessionId,
      familyId,
    });
    const accessToken = this.tokenService.issueAccessToken({
      userId: user._id,
      sessionId,
    });
    const refreshTokenExpiresAt = new Date(
      now.getTime() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.repository.createRefreshSession({
      sessionId,
      familyId,
      userId: user._id,
      tokenHash: hashOpaqueToken(refreshToken),
      deviceName: context.deviceName || "Unknown device",
      platform: context.platform || "unknown",
      ipHash: this.getIpHash(context),
      expiresAt: refreshTokenExpiresAt,
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenExpiresAt,
      user: serializePrivateUser(user),
    };
  }

  async refresh(refreshToken, context) {
    const claims = this.tokenService.verifyRefreshToken(refreshToken);
    const now = this.clock();
    const incomingHash = hashOpaqueToken(refreshToken);
    const replacementSessionId = randomUUID();
    const replacementRefreshToken = this.tokenService.issueRefreshToken({
      userId: claims.sub,
      sessionId: replacementSessionId,
      familyId: claims.fid,
    });
    let outcome = { type: "invalid" };

    await this.repository.withTransaction(async (session) => {
      const storedSession = await this.repository.findRefreshSession(
        claims.sid,
        { session },
      );

      if (
        !storedSession ||
        String(storedSession.userId) !== claims.sub ||
        storedSession.familyId !== claims.fid
      ) {
        return;
      }

      if (
        storedSession.revokedAt ||
        !safeHashEquals(storedSession.tokenHash, incomingHash)
      ) {
        await this.repository.revokeRefreshFamily(
          storedSession.familyId,
          now,
          session,
        );
        await this.repository.createSecurityEvent(
          {
            userId: storedSession.userId,
            type: "refresh_token_reuse",
            ipHash: this.getIpHash(context),
          },
          session,
        );
        outcome = { type: "reuse" };
        return;
      }

      if (new Date(storedSession.expiresAt) <= now) {
        await this.repository.revokeRefreshSession(
          storedSession.sessionId,
          now,
          session,
        );
        return;
      }

      const user = await this.repository.findUserById(storedSession.userId, {
        session,
      });

      if (!user || user.accountStatus !== "active") {
        await this.repository.revokeRefreshFamily(
          storedSession.familyId,
          now,
          session,
        );
        outcome = { type: "unavailable" };
        return;
      }

      const replaced = await this.repository.replaceRefreshSession(
        storedSession.sessionId,
        replacementSessionId,
        now,
        session,
      );

      if (!replaced) {
        await this.repository.revokeRefreshFamily(
          storedSession.familyId,
          now,
          session,
        );
        await this.repository.createSecurityEvent(
          {
            userId: storedSession.userId,
            type: "refresh_token_reuse",
            ipHash: this.getIpHash(context),
          },
          session,
        );
        outcome = { type: "reuse" };
        return;
      }

      const refreshTokenExpiresAt = new Date(
        now.getTime() + this.config.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
      );
      await this.repository.createRefreshSession(
        {
          sessionId: replacementSessionId,
          familyId: storedSession.familyId,
          userId: storedSession.userId,
          tokenHash: hashOpaqueToken(replacementRefreshToken),
          deviceName: context?.deviceName || storedSession.deviceName,
          platform: context?.platform || storedSession.platform,
          ipHash: this.getIpHash(context),
          expiresAt: refreshTokenExpiresAt,
        },
        session,
      );

      outcome = {
        type: "success",
        accessToken: this.tokenService.issueAccessToken({
          userId: user._id,
          sessionId: replacementSessionId,
        }),
        refreshToken: replacementRefreshToken,
        refreshTokenExpiresAt,
        user: serializePrivateUser(user),
      };
    });

    if (outcome.type === "reuse") {
      throw authError(
        401,
        "REFRESH_TOKEN_REUSE_DETECTED",
        "Session reuse was detected. Sign in again.",
      );
    }

    if (outcome.type === "unavailable") {
      throw authError(
        403,
        "ACCOUNT_UNAVAILABLE",
        "This account is unavailable",
      );
    }

    if (outcome.type !== "success") {
      throw authError(
        401,
        "REFRESH_TOKEN_INVALID",
        "Refresh token is invalid or expired",
      );
    }

    return outcome;
  }

  async authenticateAccessToken(accessToken) {
    const claims = this.tokenService.verifyAccessToken(accessToken);
    const now = this.clock();
    const [user, sessionIsActive] = await Promise.all([
      this.repository.findUserById(claims.sub),
      this.repository.isRefreshSessionActive(claims.sid, claims.sub, now),
    ]);

    if (!user || user.accountStatus !== "active" || !sessionIsActive) {
      throw authError(401, "AUTH_REQUIRED", "Authentication is required");
    }

    return {
      userId: String(user._id),
      sessionId: claims.sid,
      role: user.role,
      emailVerified: user.emailVerified,
      accessTokenExpiresAt: new Date(claims.exp * 1000),
      user: serializePrivateUser(user),
    };
  }

  async logout({ refreshToken, accessToken }) {
    const sessionIds = new Set();

    try {
      if (refreshToken) {
        sessionIds.add(this.tokenService.verifyRefreshToken(refreshToken).sid);
      }
    } catch {
      // Logout is intentionally idempotent for missing, expired, and already-rotated tokens.
    }

    try {
      if (accessToken) {
        sessionIds.add(this.tokenService.verifyAccessToken(accessToken).sid);
      }
    } catch {
      // Logout is intentionally idempotent for missing or expired access tokens.
    }

    const now = this.clock();
    await Promise.all(
      [...sessionIds].map((sessionId) =>
        this.repository.revokeRefreshSession(sessionId, now),
      ),
    );

    return { message: "Signed out" };
  }

  async logoutAll(userId) {
    await this.repository.revokeAllUserSessions(userId, this.clock());
    return { message: "Signed out from all devices" };
  }

  async accountClosureRequirements(userId) {
    const user = await this.repository.findUserById(userId);

    if (!user || user.accountStatus !== "active") {
      throw authError(401, "AUTH_REQUIRED", "Authentication is required");
    }

    const blockers =
      user.role === "user"
        ? await this.repository.findAccountClosureBlockers(userId)
        : ["staff_account"];

    return {
      eligible: blockers.length === 0,
      blockers,
      policyVersion: this.config.accountClosurePolicyVersion,
      noticeUrl: this.config.accountClosureNoticeUrl || null,
      effect:
        "Closing immediately disables sign-in and removes direct profile and contact details. Completed transaction, safety, consent, security, and audit records may be retained under the published policy. Pending identity documents are queued for deletion.",
    };
  }

  async closeAccount(userId, input, context) {
    if (
      input.confirmation !== "CLOSE MY ACCOUNT" ||
      input.retentionAcknowledged !== true
    ) {
      throw authError(
        422,
        "ACCOUNT_CLOSURE_CONFIRMATION_REQUIRED",
        "Confirm the permanent account closure and retention notice.",
      );
    }

    if (input.policyVersion !== this.config.accountClosurePolicyVersion) {
      throw authError(
        409,
        "ACCOUNT_CLOSURE_NOTICE_CHANGED",
        "The account-closure notice changed. Review it before continuing.",
      );
    }

    const user = await this.repository.findActiveUserWithPassword(userId);

    if (!user) {
      throw authError(401, "AUTH_REQUIRED", "Authentication is required");
    }

    if (user.role !== "user") {
      throw authError(
        403,
        "ACCOUNT_CLOSURE_FORBIDDEN",
        "Staff accounts require an administrator-managed offboarding process.",
      );
    }

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw authError(
        401,
        "INVALID_CREDENTIALS",
        "Email or password is incorrect",
      );
    }

    const now = this.clock();
    const replacementPasswordHash = await bcrypt.hash(
      randomUUID(),
      this.config.passwordHashRounds,
    );
    const anonymousEmail = `closed+${randomUUID()}@deleted.invalid`;

    await this.repository.withTransaction(async (session) => {
      const current = await this.repository.findActiveUserWithPassword(
        userId,
        session,
      );
      if (!current) {
        throw authError(409, "ACCOUNT_STATE_CHANGED", "Account state changed");
      }
      if (current.passwordHash !== user.passwordHash) {
        throw authError(409, "ACCOUNT_STATE_CHANGED", "Account state changed");
      }
      if (current.role !== "user") {
        throw authError(
          403,
          "ACCOUNT_CLOSURE_FORBIDDEN",
          "Staff accounts require an administrator-managed offboarding process.",
        );
      }

      const blockers = await this.repository.findAccountClosureBlockers(
        userId,
        session,
      );
      if (blockers.length) {
        throw authError(
          409,
          "ACCOUNT_CLOSURE_BLOCKED",
          "Resolve active commitments before closing this account.",
          { blockers },
        );
      }

      const closed = await this.repository.closeUserAccount(
        {
          userId,
          passwordHash: replacementPasswordHash,
          policyVersion: this.config.accountClosurePolicyVersion,
          anonymousEmail,
          now,
        },
        session,
      );
      if (!closed) {
        throw authError(409, "ACCOUNT_STATE_CHANGED", "Account state changed");
      }

      await this.repository.invalidateAllAuthTokens(userId, now, session);
      await this.repository.revokeAllUserSessions(userId, now, session);
      await this.repository.expireIdentityDataForAccount(userId, now, session);
      await this.repository.createSecurityEvent(
        {
          userId,
          type: "account_closed",
          ipHash: this.getIpHash(context),
          metadata: {
            policyVersion: this.config.accountClosurePolicyVersion,
          },
        },
        session,
      );
    });

    return {
      message: "Account closed",
      closedAt: now.toISOString(),
    };
  }
}
