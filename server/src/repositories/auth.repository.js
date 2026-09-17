import mongoose from "mongoose";

import { AuthToken } from "../models/AuthToken.js";
import { CommunityMission } from "../models/CommunityMission.js";
import { GiveawayItem } from "../models/GiveawayItem.js";
import { GiveawayReservation } from "../models/GiveawayReservation.js";
import { HelpOffer } from "../models/HelpOffer.js";
import { HelpRequest } from "../models/HelpRequest.js";
import { MissionContribution } from "../models/MissionContribution.js";
import { RefreshSession } from "../models/RefreshSession.js";
import { SecurityEvent } from "../models/SecurityEvent.js";
import { User } from "../models/User.js";
import { VerificationRecord } from "../models/VerificationRecord.js";
import { VerificationUpload } from "../models/VerificationUpload.js";

function attachSession(query, session) {
  return session ? query.session(session) : query;
}

export class AuthRepository {
  async withTransaction(work) {
    return mongoose.connection.transaction((session) => work(session));
  }

  async createUser(data, session) {
    const [user] = await User.create([data], { session });
    return user.toObject();
  }

  async findUserByEmail(
    emailNormalized,
    { includePassword = false, session } = {},
  ) {
    let query = User.findOne({ emailNormalized });

    if (includePassword) {
      query = query.select("+passwordHash");
    }

    return attachSession(query, session).lean().exec();
  }

  async findUserById(userId, { session } = {}) {
    return attachSession(User.findById(userId), session).lean().exec();
  }

  async findActiveUserWithPassword(userId, session) {
    return attachSession(
      User.findOne({ _id: userId, accountStatus: "active" }).select(
        "+passwordHash",
      ),
      session,
    )
      .lean()
      .exec();
  }

  async findAccountClosureBlockers(userId, session) {
    const checks = [
      [
        "help_requests",
        HelpRequest.exists({
          ownerId: userId,
          status: {
            $in: [
              "draft",
              "pending_review",
              "changes_requested",
              "published",
              "partially_solved",
            ],
          },
        }),
      ],
      [
        "help_offers",
        HelpOffer.exists({
          helperId: userId,
          status: {
            $in: [
              "pending",
              "accepted",
              "in_progress",
              "completion_submitted",
              "disputed",
            ],
          },
        }),
      ],
      [
        "giveaway_items",
        GiveawayItem.exists({
          ownerId: userId,
          status: { $in: ["available", "reserved"] },
        }),
      ],
      [
        "giveaway_reservations",
        GiveawayReservation.exists({
          status: "reserved",
          $or: [{ donorId: userId }, { recipientId: userId }],
        }),
      ],
      [
        "community_missions",
        CommunityMission.exists({
          creatorId: userId,
          status: {
            $in: [
              "draft",
              "pending_review",
              "changes_requested",
              "published",
              "in_progress",
            ],
          },
        }),
      ],
      [
        "mission_contributions",
        MissionContribution.exists({
          status: {
            $in: ["pending", "accepted", "in_progress", "completion_submitted"],
          },
          $or: [{ creatorId: userId }, { contributorId: userId }],
        }),
      ],
    ];
    const results = await Promise.all(
      checks.map(([, query]) => attachSession(query, session)),
    );

    return checks
      .filter((_, index) => Boolean(results[index]))
      .map(([code]) => code);
  }

  async markEmailVerified(userId, now, session) {
    return User.findOneAndUpdate(
      { _id: userId, emailVerified: false },
      {
        $set: {
          emailVerified: true,
          "verification.level": "EMAIL_VERIFIED",
          updatedAt: now,
        },
      },
      { new: true, session },
    )
      .lean()
      .exec();
  }

  async updatePassword(userId, passwordHash, now, session) {
    return User.findByIdAndUpdate(
      userId,
      { $set: { passwordHash, updatedAt: now } },
      { new: true, session },
    )
      .lean()
      .exec();
  }

  async createAuthToken(data, session) {
    const [token] = await AuthToken.create([data], { session });
    return token.toObject();
  }

  async invalidateAuthTokens(userId, type, now, session) {
    await AuthToken.updateMany(
      { userId, type, consumedAt: null },
      { $set: { consumedAt: now } },
      { session },
    );
  }

  async invalidateAllAuthTokens(userId, now, session) {
    await AuthToken.updateMany(
      { userId, consumedAt: null },
      { $set: { consumedAt: now } },
      { session },
    );
  }

  async consumeAuthToken(tokenHash, type, now, session) {
    return AuthToken.findOneAndUpdate(
      {
        tokenHash,
        type,
        consumedAt: null,
        expiresAt: { $gt: now },
      },
      { $set: { consumedAt: now } },
      { new: true, session },
    )
      .lean()
      .exec();
  }

  async createRefreshSession(data, session) {
    const [refreshSession] = await RefreshSession.create([data], { session });
    return refreshSession.toObject();
  }

  async findRefreshSession(sessionId, { session } = {}) {
    return attachSession(
      RefreshSession.findOne({ sessionId }).select("+tokenHash +ipHash"),
      session,
    )
      .lean()
      .exec();
  }

  async replaceRefreshSession(sessionId, replacementId, now, session) {
    const result = await RefreshSession.updateOne(
      { sessionId, revokedAt: null, expiresAt: { $gt: now } },
      {
        $set: {
          revokedAt: now,
          replacedBy: replacementId,
          lastUsedAt: now,
        },
      },
      { session },
    );

    return result.modifiedCount === 1;
  }

  async revokeRefreshSession(sessionId, now, session) {
    await RefreshSession.updateOne(
      { sessionId, revokedAt: null },
      { $set: { revokedAt: now } },
      { session },
    );
  }

  async revokeRefreshFamily(familyId, now, session) {
    await RefreshSession.updateMany(
      { familyId, revokedAt: null },
      { $set: { revokedAt: now } },
      { session },
    );
  }

  async revokeAllUserSessions(userId, now, session) {
    await RefreshSession.updateMany(
      { userId, revokedAt: null },
      { $set: { revokedAt: now } },
      { session },
    );
  }

  async isRefreshSessionActive(sessionId, userId, now) {
    return Boolean(
      await RefreshSession.exists({
        sessionId,
        userId,
        revokedAt: null,
        expiresAt: { $gt: now },
      }),
    );
  }

  async createSecurityEvent(data, session) {
    const [event] = await SecurityEvent.create([data], { session });
    return event.toObject();
  }

  async closeUserAccount(
    { userId, passwordHash, policyVersion, anonymousEmail, now },
    session,
  ) {
    return User.findOneAndUpdate(
      { _id: userId, accountStatus: "active", role: "user" },
      {
        $set: {
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
        },
      },
      { new: true, runValidators: true, session },
    )
      .lean()
      .exec();
  }

  async expireIdentityDataForAccount(userId, now, session) {
    await VerificationRecord.updateMany(
      { userId, status: "pending" },
      {
        $set: {
          status: "expired",
          expiredAt: now,
          claimBy: null,
          claimExpiresAt: null,
          updatedAt: now,
        },
        $unset: { activeKey: 1 },
      },
      { session, runValidators: true },
    );
    await VerificationUpload.updateMany(
      { ownerId: userId },
      { $set: { purgeAt: now, updatedAt: now } },
      { session, runValidators: true },
    );
  }
}
