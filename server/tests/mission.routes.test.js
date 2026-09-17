import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createAuthFixture,
  registerAndVerify,
  validRegistration,
} from "./helpers/createAuthFixture.js";

const credentials = {
  password: validRegistration.password,
  passwordConfirmation: validRegistration.passwordConfirmation,
  termsAccepted: true,
  privacyAccepted: true,
};

async function createUser(fixture, firstName, email) {
  const registration = {
    ...credentials,
    firstName,
    lastName: "Santos",
    email,
  };
  const user = await registerAndVerify(fixture, registration);
  const session = await fixture.authService.login(
    {
      email,
      password: registration.password,
      deviceName: `${firstName} mission test`,
      platform: "web",
    },
    { ipAddress: "203.0.113.70" },
  );
  return { user, authorization: `Bearer ${session.accessToken}` };
}

async function actors() {
  const fixture = createAuthFixture();
  const creator = await createUser(
    fixture,
    "Creator",
    "mission-creator@example.com",
  );
  const volunteer = await createUser(
    fixture,
    "Volunteer",
    "mission-volunteer@example.com",
  );
  const other = await createUser(fixture, "Other", "mission-other@example.com");
  const moderator = await createUser(
    fixture,
    "Moderator",
    "mission-moderator@example.com",
  );
  fixture.repository.users.get(moderator.user.id).role = "moderator";
  Object.assign(fixture.repository.users.get(volunteer.user.id), {
    skills: ["community cleanup"],
    location: {
      country: "Philippines",
      province: "Cebu",
      city: "Cebu City",
      barangay: null,
    },
  });
  Object.assign(fixture.repository.users.get(other.user.id), {
    skills: ["community cleanup"],
    location: {
      country: "Philippines",
      province: "Cebu",
      city: "Mandaue City",
      barangay: null,
    },
  });
  return { fixture, creator, volunteer, other, moderator };
}

function missionBody(overrides = {}) {
  return {
    title: "Restore the shared handwashing station",
    description:
      "The shared handwashing station beside the community hall has a broken tap and needs a small supervised repair for safe public use.",
    category: "community_repair",
    location: {
      country: "Philippines",
      province: "Cebu",
      city: "Cebu City",
      barangay: "Private community site detail",
    },
    requiredResources: [
      {
        name: "Supervised repair volunteer",
        description:
          "Help replace the tap during the scheduled community work period.",
        type: "skill",
        quantity: 1,
        estimatedMinutes: 90,
        requiredSkills: ["community cleanup"],
      },
    ],
    evidenceNote:
      "The community hall caretaker confirmed the broken tap and permission for a supervised repair.",
    ...overrides,
  };
}

async function createMission(
  fixture,
  creator,
  body = missionBody(),
  key = "mission-create-key-0001",
) {
  return request(fixture.app)
    .post("/api/v1/community-missions")
    .set("Authorization", creator.authorization)
    .set("Idempotency-Key", key)
    .send(body);
}

async function publishMission(fixture, creator, moderator) {
  const created = await createMission(fixture, creator);
  expect(created.status).toBe(201);
  const missionId = created.body.data.mission.id;
  expect(
    (
      await request(fixture.app)
        .post(`/api/v1/community-missions/${missionId}/submit`)
        .set("Authorization", creator.authorization)
        .send({})
    ).status,
  ).toBe(200);
  expect(
    (
      await request(fixture.app)
        .post(`/api/v1/admin/community-missions/${missionId}/approve`)
        .set("Authorization", moderator.authorization)
        .send({})
    ).status,
  ).toBe(200);
  return {
    missionId,
    resourceId: created.body.data.mission.requiredResources[0].id,
  };
}

async function contribute(fixture, missionId, resourceId, volunteer, key) {
  return request(fixture.app)
    .post(`/api/v1/community-missions/${missionId}/contributions`)
    .set("Authorization", volunteer.authorization)
    .set("Idempotency-Key", key)
    .send({
      resourceId,
      message: "I can join the supervised repair and bring basic hand tools.",
      quantity: 1,
      estimatedMinutes: 90,
    });
}

describe("community mission API", () => {
  it("keeps drafts private, moderates publication, and hides private evidence/location", async () => {
    const { fixture, creator, volunteer, moderator } = await actors();
    const created = await createMission(fixture, creator);
    expect(created.status).toBe(201);
    expect(created.body.data.mission).toMatchObject({
      status: "draft",
      verificationStatus: "unverified",
      location: { barangay: "Private community site detail" },
      evidence: { note: expect.any(String) },
    });
    const replay = await createMission(fixture, creator);
    expect(replay.status).toBe(201);
    expect(replay.body.data.mission.id).toBe(created.body.data.mission.id);
    expect(fixture.missionRepository.missions.size).toBe(1);

    const missionId = created.body.data.mission.id;
    expect(
      (
        await request(fixture.app).get(
          `/api/v1/community-missions/${missionId}`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(fixture.app)
          .post(`/api/v1/community-missions/${missionId}/submit`)
          .set("Authorization", creator.authorization)
          .send({})
      ).status,
    ).toBe(200);

    const ordinaryReview = await request(fixture.app)
      .post(`/api/v1/admin/community-missions/${missionId}/approve`)
      .set("Authorization", volunteer.authorization)
      .send({});
    expect(ordinaryReview.status).toBe(403);
    const approved = await request(fixture.app)
      .post(`/api/v1/admin/community-missions/${missionId}/approve`)
      .set("Authorization", moderator.authorization)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.mission.verificationStatus).toBe("verified");

    const publicRead = await request(fixture.app).get(
      `/api/v1/community-missions/${missionId}`,
    );
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.data.mission).toMatchObject({
      creator: { displayName: "Creator S." },
      publicLocation: { city: "Cebu City", province: "Cebu" },
    });
    expect(publicRead.body.data.mission).not.toHaveProperty("location");
    expect(publicRead.body.data.mission).not.toHaveProperty("evidence");
    expect(JSON.stringify(publicRead.body)).not.toContain(
      "Private community site detail",
    );
    expect(
      (
        await request(fixture.app)
          .get(`/api/v1/community-missions/${missionId}/contributions`)
          .set("Authorization", volunteer.authorization)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(fixture.app)
          .get(`/api/v1/community-missions/${missionId}/contributions`)
          .set("Authorization", creator.authorization)
      ).status,
    ).toBe(200);
    fixture.repository.users.get(creator.user.id).accountStatus = "suspended";
    expect(
      (
        await request(fixture.app).get(
          `/api/v1/community-missions/${missionId}`,
        )
      ).status,
    ).toBe(404);
  });

  it("matches verified missions using saved skills and general location", async () => {
    const { fixture, creator, volunteer, moderator } = await actors();
    const { missionId } = await publishMission(fixture, creator, moderator);
    const matches = await request(fixture.app)
      .get("/api/v1/community-missions/matches")
      .set("Authorization", volunteer.authorization);
    expect(matches.status).toBe(200);
    expect(matches.body.data.items).toHaveLength(1);
    expect(matches.body.data.items[0]).toMatchObject({
      id: missionId,
      match: {
        matchedSkills: ["community cleanup"],
        locationLevel: "same_city",
      },
    });
    expect(matches.body.data.items[0].match.reasons).toEqual(
      expect.arrayContaining(["1 saved skill match", "Same city"]),
    );
  });

  it("paginates the moderation queue using the nested submission timestamp", async () => {
    const { fixture, creator, moderator } = await actors();
    const first = await createMission(
      fixture,
      creator,
      missionBody({ title: "Restore the first shared handwashing station" }),
      "mission-moderation-page-1",
    );
    const second = await createMission(
      fixture,
      creator,
      missionBody({ title: "Restore the second shared handwashing station" }),
      "mission-moderation-page-2",
    );
    for (const created of [first, second]) {
      expect(
        (
          await request(fixture.app)
            .post(
              `/api/v1/community-missions/${created.body.data.mission.id}/submit`,
            )
            .set("Authorization", creator.authorization)
            .send({})
        ).status,
      ).toBe(200);
    }

    const firstPage = await request(fixture.app)
      .get("/api/v1/admin/community-missions?limit=1")
      .set("Authorization", moderator.authorization);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.data.items).toHaveLength(1);
    expect(firstPage.body.data.pageInfo).toMatchObject({
      hasNextPage: true,
      nextCursor: expect.any(String),
    });
    const secondPage = await request(fixture.app)
      .get(
        `/api/v1/admin/community-missions?limit=1&cursor=${encodeURIComponent(firstPage.body.data.pageInfo.nextCursor)}`,
      )
      .set("Authorization", moderator.authorization);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.data.items).toHaveLength(1);
    expect(secondPage.body.data.items[0].id).not.toBe(
      firstPage.body.data.items[0].id,
    );
  });

  it("reserves final capacity once and completes only after contributor submission and creator confirmation", async () => {
    const { fixture, creator, volunteer, other, moderator } = await actors();
    const { missionId, resourceId } = await publishMission(
      fixture,
      creator,
      moderator,
    );
    const first = await contribute(
      fixture,
      missionId,
      resourceId,
      volunteer,
      "mission-contribute-volunteer",
    );
    const second = await contribute(
      fixture,
      missionId,
      resourceId,
      other,
      "mission-contribute-other",
    );
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const attempts = await Promise.all(
      [first, second].map((response, index) =>
        request(fixture.app)
          .post(
            `/api/v1/mission-contributions/${response.body.data.contribution.id}/accept`,
          )
          .set("Authorization", creator.authorization)
          .set("Idempotency-Key", `mission-accept-key-${index}`)
          .send({}),
      ),
    );
    expect(attempts.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = attempts.find((response) => response.status === 200);
    const contributionId = winner.body.data.contribution.id;
    const contributor =
      winner.body.data.contribution.contributorId === volunteer.user.id
        ? volunteer
        : other;
    const storedMission = fixture.missionRepository.missions.get(missionId);
    expect(storedMission.requiredResources[0]).toMatchObject({
      reservedQuantity: 1,
      fulfilledQuantity: 0,
    });
    const closedMatches = await request(fixture.app)
      .get("/api/v1/community-missions/matches")
      .set("Authorization", other.authorization);
    expect(closedMatches.status).toBe(200);
    expect(closedMatches.body.data.items).toHaveLength(0);
    const rejectedPending = [first, second].find(
      (response) => response.body.data.contribution.id !== contributionId,
    );
    const rejectedContributor =
      rejectedPending.body.data.contribution.contributorId === volunteer.user.id
        ? volunteer
        : other;
    expect(
      (
        await request(fixture.app)
          .post(
            `/api/v1/mission-contributions/${rejectedPending.body.data.contribution.id}/reject`,
          )
          .set("Authorization", creator.authorization)
          .send({})
      ).status,
    ).toBe(200);
    const overCapacity = await contribute(
      fixture,
      missionId,
      resourceId,
      rejectedContributor,
      "mission-contribute-after-reservation",
    );
    expect(overCapacity.status).toBe(409);
    expect(overCapacity.body.error.code).toBe("MISSION_CAPACITY_UNAVAILABLE");

    expect(
      (
        await request(fixture.app)
          .post(`/api/v1/mission-contributions/${contributionId}/start`)
          .set("Authorization", contributor.authorization)
          .send({})
      ).status,
    ).toBe(200);
    const submitted = await request(fixture.app)
      .post(`/api/v1/mission-contributions/${contributionId}/complete`)
      .set("Authorization", contributor.authorization)
      .set("Idempotency-Key", "mission-complete-key-0001")
      .send({
        note: "The supervised repair was completed and the tap now works.",
        actualMinutes: 75,
      });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.contribution.status).toBe(
      "completion_submitted",
    );
    expect(storedMission.status).toBe("in_progress");
    expect(storedMission.requiredResources[0].fulfilledQuantity).toBe(0);
    const impactBeforeConfirmation = await request(fixture.app).get(
      `/api/v1/impact/users/${contributor.user.id}`,
    );
    expect(impactBeforeConfirmation.body.data.impact).toMatchObject({
      problemsSolved: 0,
      volunteerMinutes: 0,
      skillsProvided: 0,
    });

    const outsiderConfirm = await request(fixture.app)
      .post(`/api/v1/mission-contributions/${contributionId}/confirm`)
      .set("Authorization", other.authorization)
      .set("Idempotency-Key", "mission-confirm-outsider")
      .send({});
    expect(outsiderConfirm.status).toBe(404);

    const confirmed = await request(fixture.app)
      .post(`/api/v1/mission-contributions/${contributionId}/confirm`)
      .set("Authorization", creator.authorization)
      .set("Idempotency-Key", "mission-confirm-key-0001")
      .send({});
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.data.contribution.status).toBe("completed");
    expect(storedMission).toMatchObject({ status: "completed" });
    expect(storedMission.requiredResources[0]).toMatchObject({
      reservedQuantity: 0,
      fulfilledQuantity: 1,
    });
    const completedPublicMission = await request(fixture.app).get(
      `/api/v1/community-missions/${missionId}`,
    );
    expect(completedPublicMission.status).toBe(200);
    expect(completedPublicMission.body.data.mission).toMatchObject({
      id: missionId,
      status: "completed",
      verificationStatus: "verified",
    });
    const impact = await request(fixture.app).get(
      `/api/v1/impact/users/${contributor.user.id}`,
    );
    expect(impact.status).toBe(200);
    expect(impact.body.data.impact).toMatchObject({
      problemsSolved: 1,
      volunteerMinutes: 75,
      hoursVolunteered: 1.25,
      skillsProvided: 1,
    });
  });

  it("releases accepted capacity when an uncontested mission is cancelled", async () => {
    const { fixture, creator, volunteer, moderator } = await actors();
    const { missionId, resourceId } = await publishMission(
      fixture,
      creator,
      moderator,
    );
    const offered = await contribute(
      fixture,
      missionId,
      resourceId,
      volunteer,
      "mission-cancel-contribution",
    );
    const contributionId = offered.body.data.contribution.id;
    expect(
      (
        await request(fixture.app)
          .post(`/api/v1/mission-contributions/${contributionId}/accept`)
          .set("Authorization", creator.authorization)
          .set("Idempotency-Key", "mission-cancel-accept")
          .send({})
      ).status,
    ).toBe(200);
    const notificationsBeforeCancellation =
      fixture.publishedNotificationEvents.length;
    const cancelled = await request(fixture.app)
      .post(`/api/v1/community-missions/${missionId}/cancel`)
      .set("Authorization", creator.authorization)
      .send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.mission.status).toBe("cancelled");
    expect(
      fixture.missionRepository.missions.get(missionId).requiredResources[0]
        .reservedQuantity,
    ).toBe(0);
    expect(
      fixture.missionRepository.contributions.get(contributionId).status,
    ).toBe("cancelled");
    expect(fixture.publishedNotificationEvents).toHaveLength(
      notificationsBeforeCancellation + 1,
    );
  });
});
