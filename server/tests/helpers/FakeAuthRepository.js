import { randomBytes, randomUUID } from "node:crypto";

function withoutPassword(user) {
  if (!user) {
    return null;
  }

  const safeUser = { ...user };
  delete safeUser.passwordHash;
  return safeUser;
}

export class FakeAuthRepository {
  constructor() {
    this.users = new Map();
    this.authTokens = [];
    this.refreshSessions = new Map();
    this.securityEvents = [];
    this.accountClosureBlockers = [];
    this.identityClosureUpdates = [];
  }

  async withTransaction(work) {
    return work({ fake: true });
  }

  async createUser(data) {
    if (
      [...this.users.values()].some(
        (user) => user.emailNormalized === data.emailNormalized,
      )
    ) {
      const error = new Error("Duplicate email");
      error.code = 11000;
      error.keyPattern = { emailNormalized: 1 };
      throw error;
    }

    const now = new Date();
    const user = {
      _id: randomBytes(12).toString("hex"),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(String(user._id), user);
    return { ...user };
  }

  async findUserByEmail(emailNormalized, { includePassword = false } = {}) {
    const user = [...this.users.values()].find(
      (candidate) => candidate.emailNormalized === emailNormalized,
    );
    return includePassword
      ? user
        ? { ...user }
        : null
      : withoutPassword(user);
  }

  async findUserById(userId) {
    return withoutPassword(this.users.get(String(userId)));
  }

  async findActiveUserWithPassword(userId) {
    const user = this.users.get(String(userId));
    return user?.accountStatus === "active" ? { ...user } : null;
  }

  async findAccountClosureBlockers() {
    return [...this.accountClosureBlockers];
  }

  async markEmailVerified(userId, now) {
    const user = this.users.get(String(userId));

    if (!user || user.emailVerified) {
      return null;
    }

    user.emailVerified = true;
    user.verification = { level: "EMAIL_VERIFIED" };
    user.updatedAt = now;
    return withoutPassword(user);
  }

  async updatePassword(userId, passwordHash, now) {
    const user = this.users.get(String(userId));

    if (!user) {
      return null;
    }

    user.passwordHash = passwordHash;
    user.updatedAt = now;
    return withoutPassword(user);
  }

  async createAuthToken(data) {
    const token = { _id: randomUUID(), ...data, consumedAt: null };
    this.authTokens.push(token);
    return { ...token };
  }

  async invalidateAuthTokens(userId, type, now) {
    for (const token of this.authTokens) {
      if (
        String(token.userId) === String(userId) &&
        token.type === type &&
        !token.consumedAt
      ) {
        token.consumedAt = now;
      }
    }
  }

  async invalidateAllAuthTokens(userId, now) {
    for (const token of this.authTokens) {
      if (String(token.userId) === String(userId) && !token.consumedAt) {
        token.consumedAt = now;
      }
    }
  }

  async consumeAuthToken(tokenHash, type, now) {
    const token = this.authTokens.find(
      (candidate) =>
        candidate.tokenHash === tokenHash &&
        candidate.type === type &&
        !candidate.consumedAt &&
        new Date(candidate.expiresAt) > now,
    );

    if (!token) {
      return null;
    }

    token.consumedAt = now;
    return { ...token };
  }

  async createRefreshSession(data) {
    const refreshSession = {
      _id: randomUUID(),
      ...data,
      revokedAt: null,
      replacedBy: null,
      lastUsedAt: null,
    };
    this.refreshSessions.set(refreshSession.sessionId, refreshSession);
    return { ...refreshSession };
  }

  async findRefreshSession(sessionId) {
    const refreshSession = this.refreshSessions.get(sessionId);
    return refreshSession ? { ...refreshSession } : null;
  }

  async replaceRefreshSession(sessionId, replacementId, now) {
    const refreshSession = this.refreshSessions.get(sessionId);

    if (
      !refreshSession ||
      refreshSession.revokedAt ||
      new Date(refreshSession.expiresAt) <= now
    ) {
      return false;
    }

    refreshSession.revokedAt = now;
    refreshSession.replacedBy = replacementId;
    refreshSession.lastUsedAt = now;
    return true;
  }

  async revokeRefreshSession(sessionId, now) {
    const refreshSession = this.refreshSessions.get(sessionId);

    if (refreshSession && !refreshSession.revokedAt) {
      refreshSession.revokedAt = now;
    }
  }

  async revokeRefreshFamily(familyId, now) {
    for (const refreshSession of this.refreshSessions.values()) {
      if (refreshSession.familyId === familyId && !refreshSession.revokedAt) {
        refreshSession.revokedAt = now;
      }
    }
  }

  async revokeAllUserSessions(userId, now) {
    for (const refreshSession of this.refreshSessions.values()) {
      if (
        String(refreshSession.userId) === String(userId) &&
        !refreshSession.revokedAt
      ) {
        refreshSession.revokedAt = now;
      }
    }
  }

  async isRefreshSessionActive(sessionId, userId, now) {
    const refreshSession = this.refreshSessions.get(sessionId);
    return Boolean(
      refreshSession &&
      String(refreshSession.userId) === String(userId) &&
      !refreshSession.revokedAt &&
      new Date(refreshSession.expiresAt) > now,
    );
  }

  async createSecurityEvent(data) {
    const event = { _id: randomUUID(), ...data, createdAt: new Date() };
    this.securityEvents.push(event);
    return { ...event };
  }

  async closeUserAccount({
    userId,
    passwordHash,
    policyVersion,
    anonymousEmail,
    now,
  }) {
    const user = this.users.get(String(userId));
    if (!user || user.accountStatus !== "active" || user.role !== "user") {
      return null;
    }

    Object.assign(user, {
      firstName: "Closed",
      lastName: "Account",
      email: anonymousEmail,
      emailNormalized: anonymousEmail,
      passwordHash,
      accountStatus: "disabled",
      accountClosedAt: now,
      accountClosurePolicyVersion: policyVersion,
      emailVerified: false,
      bio: null,
      skills: [],
      location: {
        country: null,
        province: null,
        city: null,
        barangay: null,
      },
      avatar: null,
      verification: { level: "UNVERIFIED" },
      updatedAt: now,
    });
    return withoutPassword(user);
  }

  async expireIdentityDataForAccount(userId, now) {
    this.identityClosureUpdates.push({ userId: String(userId), now });
  }

  async findPrivateUserById(userId) {
    const user = this.users.get(String(userId));
    return user?.accountStatus === "active" ? withoutPassword(user) : null;
  }

  async findActivePublicUserById(userId) {
    const user = this.users.get(String(userId));
    return user?.accountStatus === "active" ? withoutPassword(user) : null;
  }

  async updateUserProfile(userId, changes, now) {
    const user = this.users.get(String(userId));

    if (!user || user.accountStatus !== "active") {
      return null;
    }

    Object.assign(user, changes, { updatedAt: now });
    return withoutPassword(user);
  }
}
