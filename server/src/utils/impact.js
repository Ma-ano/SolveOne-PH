export function calculateUserImpact({
  ownedSolvedRequestIds = [],
  completedOffers = [],
  confirmedEvidence = [],
  completedGiveawayReservations = [],
  solvedRequestIds = [],
  ownedCompletedMissionIds = [],
  completedMissionContributions = [],
  completedMissionIds = [],
}) {
  const evidenceByOffer = new Map(
    confirmedEvidence.map((evidence) => [String(evidence.offerId), evidence]),
  );
  const solvedIds = new Set(solvedRequestIds.map(String));
  const completedMissionIdSet = new Set(completedMissionIds.map(String));
  const problems = new Set([
    ...ownedSolvedRequestIds.map((id) => `request:${id}`),
    ...ownedCompletedMissionIds.map((id) => `mission:${id}`),
  ]);
  let volunteerMinutes = 0;
  let itemsDonated = 0;
  let skillsProvided = 0;
  for (const offer of completedOffers) {
    const evidence = evidenceByOffer.get(String(offer._id));
    if (!evidence?.confirmedAt) continue;
    if (solvedIds.has(String(offer.requestId)))
      problems.add(`request:${offer.requestId}`);
    if (["skill", "time"].includes(offer.helpType))
      volunteerMinutes += evidence.actualMinutes ?? 0;
    if (offer.helpType === "item") itemsDonated += offer.quantity ?? 0;
    if (offer.helpType === "skill") skillsProvided += 1;
  }
  for (const reservation of completedGiveawayReservations) {
    if (!reservation.completedAt) continue;
    if (solvedIds.has(String(reservation.requestId)))
      problems.add(`request:${reservation.requestId}`);
    itemsDonated += reservation.quantity ?? 0;
  }
  for (const contribution of completedMissionContributions) {
    if (!contribution.completedAt) continue;
    if (completedMissionIdSet.has(String(contribution.missionId)))
      problems.add(`mission:${contribution.missionId}`);
    if (["skill", "time"].includes(contribution.resourceType))
      volunteerMinutes += contribution.actualMinutes ?? 0;
    if (contribution.resourceType === "item")
      itemsDonated += contribution.quantity ?? 0;
    if (contribution.resourceType === "skill") skillsProvided += 1;
  }
  return {
    problemsSolved: problems.size,
    volunteerMinutes,
    hoursVolunteered: Math.round((volunteerMinutes / 60) * 100) / 100,
    itemsDonated,
    skillsProvided,
  };
}
