import { CompletionEvidence } from "../models/CompletionEvidence.js";
import { CommunityMission } from "../models/CommunityMission.js";
import { HelpOffer } from "../models/HelpOffer.js";
import { HelpRequest } from "../models/HelpRequest.js";
import { GiveawayReservation } from "../models/GiveawayReservation.js";
import { MissionContribution } from "../models/MissionContribution.js";
import { User } from "../models/User.js";
import { calculateUserImpact } from "../utils/impact.js";

export class ImpactRepository {
  async platform() {
    const [requestsSolved, missionsCompleted] = await Promise.all([
      HelpRequest.countDocuments({ status: "solved" }),
      CommunityMission.countDocuments({ status: "completed" }),
    ]);
    return { problemsSolved: requestsSolved + missionsCompleted };
  }

  async forUser(userId) {
    const user = await User.findOne({ _id: userId, accountStatus: "active" })
      .select("_id")
      .lean()
      .exec();
    if (!user) return null;
    const [
      offers,
      giveaways,
      missionContributions,
      ownedRequests,
      ownedMissions,
    ] = await Promise.all([
      HelpOffer.find({ helperId: userId, status: "completed" })
        .select("_id requestId helpType quantity")
        .lean()
        .exec(),
      GiveawayReservation.find({ donorId: userId, status: "completed" })
        .select("_id requestId quantity completedAt")
        .lean()
        .exec(),
      MissionContribution.find({
        contributorId: userId,
        status: "completed",
      })
        .select("_id missionId resourceType quantity actualMinutes completedAt")
        .lean()
        .exec(),
      HelpRequest.find({ ownerId: userId, status: "solved" })
        .select("_id")
        .lean()
        .exec(),
      CommunityMission.find({ creatorId: userId, status: "completed" })
        .select("_id")
        .lean()
        .exec(),
    ]);
    const offerIds = offers.map((offer) => offer._id);
    const requestIds = [
      ...new Set(
        [...offers, ...giveaways].map((record) => String(record.requestId)),
      ),
    ];
    const missionIds = [
      ...new Set(
        missionContributions.map((record) => String(record.missionId)),
      ),
    ];
    const [evidence, solvedRequests, completedMissions] = await Promise.all([
      CompletionEvidence.find({
        offerId: { $in: offerIds },
        confirmedAt: { $ne: null },
      })
        .select("offerId confirmedAt actualMinutes")
        .lean()
        .exec(),
      HelpRequest.find({ _id: { $in: requestIds }, status: "solved" })
        .select("_id")
        .lean()
        .exec(),
      CommunityMission.find({
        _id: { $in: missionIds },
        status: "completed",
      })
        .select("_id")
        .lean()
        .exec(),
    ]);
    return calculateUserImpact({
      ownedSolvedRequestIds: ownedRequests.map((item) => item._id),
      completedOffers: offers,
      confirmedEvidence: evidence,
      completedGiveawayReservations: giveaways,
      solvedRequestIds: solvedRequests.map((item) => item._id),
      ownedCompletedMissionIds: ownedMissions.map((item) => item._id),
      completedMissionContributions: missionContributions,
      completedMissionIds: completedMissions.map((item) => item._id),
    });
  }
}
