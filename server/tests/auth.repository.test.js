import { afterEach, describe, expect, it, vi } from "vitest";

import { AuthToken } from "../src/models/AuthToken.js";
import { CommunityMission } from "../src/models/CommunityMission.js";
import { GiveawayItem } from "../src/models/GiveawayItem.js";
import { GiveawayReservation } from "../src/models/GiveawayReservation.js";
import { HelpOffer } from "../src/models/HelpOffer.js";
import { HelpRequest } from "../src/models/HelpRequest.js";
import { MissionContribution } from "../src/models/MissionContribution.js";
import { User } from "../src/models/User.js";
import { VerificationRecord } from "../src/models/VerificationRecord.js";
import { VerificationUpload } from "../src/models/VerificationUpload.js";
import { AuthRepository } from "../src/repositories/auth.repository.js";

const userId = "111111111111111111111111";
const now = new Date("2026-09-18T08:00:00Z");

function query(result) {
  return {
    session() {
      return this;
    },
    select() {
      return this;
    },
    lean() {
      return this;
    },
    async exec() {
      return result;
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("AuthRepository account closure", () => {
  it("reports each nonterminal relationship category", async () => {
    vi.spyOn(HelpRequest, "exists").mockReturnValue(query({ _id: "request" }));
    vi.spyOn(HelpOffer, "exists").mockReturnValue(query({ _id: "offer" }));
    vi.spyOn(GiveawayItem, "exists").mockReturnValue(query(null));
    vi.spyOn(GiveawayReservation, "exists").mockReturnValue(
      query({ _id: "reservation" }),
    );
    vi.spyOn(CommunityMission, "exists").mockReturnValue(query(null));
    vi.spyOn(MissionContribution, "exists").mockReturnValue(
      query({ _id: "contribution" }),
    );
    const repository = new AuthRepository();

    await expect(
      repository.findAccountClosureBlockers(userId, { transaction: true }),
    ).resolves.toEqual([
      "help_requests",
      "help_offers",
      "giveaway_reservations",
      "mission_contributions",
    ]);
    expect(GiveawayReservation.exists).toHaveBeenCalledWith({
      status: "reserved",
      $or: [{ donorId: userId }, { recipientId: userId }],
    });
    expect(MissionContribution.exists).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: [{ creatorId: userId }, { contributorId: userId }],
      }),
    );
  });

  it("anonymizes direct account fields and records closure metadata", async () => {
    const session = { transaction: true };
    const update = vi
      .spyOn(User, "findOneAndUpdate")
      .mockReturnValue(query({ _id: userId, accountStatus: "disabled" }));
    const repository = new AuthRepository();

    await repository.closeUserAccount(
      {
        userId,
        passwordHash: "replacement-hash",
        policyVersion: "closure-v1",
        anonymousEmail: "closed+uuid@deleted.invalid",
        now,
      },
      session,
    );

    expect(update).toHaveBeenCalledWith(
      { _id: userId, accountStatus: "active", role: "user" },
      {
        $set: expect.objectContaining({
          firstName: "Closed",
          lastName: "Account",
          email: "closed+uuid@deleted.invalid",
          emailNormalized: "closed+uuid@deleted.invalid",
          passwordHash: "replacement-hash",
          accountStatus: "disabled",
          accountClosedAt: now,
          accountClosurePolicyVersion: "closure-v1",
          emailVerified: false,
          bio: null,
          skills: [],
          avatar: null,
          verification: { level: "UNVERIFIED" },
        }),
      },
      { new: true, runValidators: true, session },
    );
  });

  it("consumes auth tokens and queues every identity upload for purge", async () => {
    const session = { transaction: true };
    const tokens = vi.spyOn(AuthToken, "updateMany").mockResolvedValue({});
    const records = vi
      .spyOn(VerificationRecord, "updateMany")
      .mockResolvedValue({});
    const uploads = vi
      .spyOn(VerificationUpload, "updateMany")
      .mockResolvedValue({});
    const repository = new AuthRepository();

    await repository.invalidateAllAuthTokens(userId, now, session);
    await repository.expireIdentityDataForAccount(userId, now, session);

    expect(tokens).toHaveBeenCalledWith(
      { userId, consumedAt: null },
      { $set: { consumedAt: now } },
      { session },
    );
    expect(records).toHaveBeenCalledWith(
      { userId, status: "pending" },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: "expired",
          expiredAt: now,
          claimBy: null,
          claimExpiresAt: null,
        }),
        $unset: { activeKey: 1 },
      }),
      { session, runValidators: true },
    );
    expect(uploads).toHaveBeenCalledWith(
      { ownerId: userId },
      { $set: { purgeAt: now, updatedAt: now } },
      { session, runValidators: true },
    );
  });
});
