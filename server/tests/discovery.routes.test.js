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
      deviceName: `${firstName} test device`,
      platform: "web",
    },
    { ipAddress: "203.0.113.51" },
  );
  return { user, session, authorization: `Bearer ${session.accessToken}` };
}

async function createActors(ownerCount = 2) {
  const fixture = createAuthFixture();
  const owners = [];
  for (let index = 0; index < ownerCount; index += 1) {
    owners.push(
      await createUser(
        fixture,
        `Owner${index + 1}`,
        `discovery-owner-${index + 1}@example.com`,
      ),
    );
  }
  const helper = await createUser(
    fixture,
    "Helper",
    "discovery-helper@example.com",
  );
  const moderator = await createUser(
    fixture,
    "Moderator",
    "discovery-moderator@example.com",
  );
  fixture.repository.users.get(moderator.user.id).role = "moderator";
  const helperRecord = fixture.repository.users.get(helper.user.id);
  helperRecord.skills = ["Tutoring", "Writing"];
  helperRecord.location = {
    country: "Philippines",
    province: "Cebu",
    city: "Cebu City",
    barangay: "Private barangay",
  };
  return { fixture, owners, helper, moderator };
}

function requestBody(overrides = {}) {
  return {
    title: "Tutoring support for school enrollment",
    description:
      "I need focused tutoring support to finish my school enrollment requirements before the published deadline.",
    category: "education",
    helpTypes: ["skill"],
    urgency: "normal",
    location: {
      country: "Philippines",
      province: "Cebu",
      city: "Cebu City",
      barangay: "Lahug",
    },
    neededBy: "2099-12-31",
    needItems: [
      {
        name: "Tutoring session",
        description: "Review the enrollment subjects and application answers",
        type: "skill",
        quantity: 1,
        estimatedValueCentavos: 0,
        estimatedMinutes: 45,
      },
    ],
    requiredSkills: ["Tutoring"],
    ...overrides,
  };
}

async function publish(fixture, owner, moderator, body) {
  const created = await request(fixture.app)
    .post("/api/v1/requests")
    .set("Authorization", owner.authorization)
    .send(body);
  expect(created.status).toBe(201);
  const requestId = created.body.data.request.id;
  const submitted = await request(fixture.app)
    .post(`/api/v1/requests/${requestId}/submit`)
    .set("Authorization", owner.authorization)
    .send({});
  expect(submitted.status).toBe(200);
  const approved = await request(fixture.app)
    .post(`/api/v1/admin/requests/${requestId}/approve`)
    .set("Authorization", moderator.authorization)
    .send({});
  expect(approved.status).toBe(200);
  return requestId;
}

describe("advanced discovery API", () => {
  it("matches profile skills, ranks factual verification first, and omits private location", async () => {
    const { fixture, owners, helper, moderator } = await createActors();
    const unverifiedId = await publish(
      fixture,
      owners[0],
      moderator,
      requestBody({
        title: "Urgent tutoring support for enrollment",
        urgency: "time_sensitive",
      }),
    );
    fixture.repository.users.get(owners[0].user.id).verification = {
      level: "UNVERIFIED",
    };
    const verifiedId = await publish(
      fixture,
      owners[1],
      moderator,
      requestBody({ title: "Verified tutoring support request" }),
    );
    const ownId = await publish(
      fixture,
      helper,
      moderator,
      requestBody({ title: "My own tutoring support request" }),
    );

    const response = await request(fixture.app)
      .get("/api/v1/requests/discover?mode=no_money")
      .set("Authorization", helper.authorization);

    expect(response.status).toBe(200);
    expect(response.body.data.criteria).toEqual({
      mode: "no_money",
      selectedSkills: ["tutoring", "writing"],
      generalLocation: { city: "Cebu City", province: "Cebu" },
    });
    expect(response.body.data.items.map((item) => item.id)).toEqual([
      verifiedId,
      unverifiedId,
    ]);
    expect(response.body.data.items.map((item) => item.id)).not.toContain(
      ownId,
    );
    expect(response.body.data.items[0].discovery).toMatchObject({
      matchedSkills: ["tutoring"],
      estimatedMinutes: 45,
      nearbyLevel: "same_city",
    });
    expect(response.body.data.items[0].discovery.reasons).toEqual(
      expect.arrayContaining([
        "1 selected skill matched",
        "Owner has a factual verification badge",
        "Same city",
      ]),
    );
    expect(response.body.data.items[0]).not.toHaveProperty("location");
    expect(JSON.stringify(response.body.data.items)).not.toContain(
      "Private barangay",
    );
  });

  it("paginates a stable ranked result set and scopes cursors to its filters", async () => {
    const { fixture, owners, moderator } = await createActors();
    await publish(fixture, owners[0], moderator, requestBody());
    await publish(
      fixture,
      owners[1],
      moderator,
      requestBody({ title: "A second tutoring support request" }),
    );

    const first = await request(fixture.app).get(
      "/api/v1/requests/discover?mode=skills&skills=Tutoring&limit=1",
    );
    expect(first.status).toBe(200);
    expect(first.body.data.items).toHaveLength(1);
    expect(first.body.data.pageInfo).toMatchObject({ hasNextPage: true });

    const second = await request(fixture.app).get(
      `/api/v1/requests/discover?mode=skills&skills=Tutoring&limit=1&cursor=${encodeURIComponent(first.body.data.pageInfo.nextCursor)}`,
    );
    expect(second.status).toBe(200);
    expect(second.body.data.items).toHaveLength(1);
    expect(second.body.data.items[0].id).not.toBe(first.body.data.items[0].id);

    const reused = await request(fixture.app).get(
      `/api/v1/requests/discover?mode=skills&skills=Tutoring&category=medical&limit=1&cursor=${encodeURIComponent(first.body.data.pageInfo.nextCursor)}`,
    );
    expect(reused.status).toBe(400);
    expect(reused.body.error.code).toBe("INVALID_CURSOR");
  });

  it("finds only financial needs fully solvable within the PHP budget", async () => {
    const { fixture, owners, helper, moderator } = await createActors(1);
    const requestId = await publish(
      fixture,
      owners[0],
      moderator,
      requestBody({
        title: "Printed enrollment packets for school",
        helpTypes: ["item"],
        needItems: [
          {
            name: "Printed packets",
            description: "Twenty printed enrollment packets for submission",
            type: "item",
            quantity: 20,
            estimatedValueCentavos: 10000,
          },
        ],
        requiredSkills: [],
      }),
    );
    fixture.requestRepository.requests.get(
      requestId,
    ).needItems[0].solvedQuantity = 10;

    const exact = await request(fixture.app)
      .get("/api/v1/requests/solvable?budget=50")
      .set("Authorization", helper.authorization);
    expect(exact.status).toBe(200);
    expect(exact.body.data.criteria.budgetCentavos).toBe(5000);
    expect(exact.body.data.items).toHaveLength(1);
    expect(exact.body.data.items[0].discovery.remainingBudgetCentavos).toBe(
      5000,
    );

    const tooSmall = await request(fixture.app).get(
      "/api/v1/requests/solvable?budget=49.99",
    );
    expect(tooSmall.status).toBe(200);
    expect(tooSmall.body.data.items).toEqual([]);

    const invalid = await request(fixture.app).get(
      "/api/v1/requests/solvable?budget=-1",
    );
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("requires explicit or saved context for skill and nearby modes", async () => {
    const fixture = createAuthFixture();
    const skills = await request(fixture.app).get(
      "/api/v1/requests/discover?mode=no_money",
    );
    expect(skills.status).toBe(422);
    expect(skills.body.error.code).toBe("DISCOVERY_SKILLS_REQUIRED");

    const nearby = await request(fixture.app).get(
      "/api/v1/requests/discover?mode=nearby",
    );
    expect(nearby.status).toBe(422);
    expect(nearby.body.error.code).toBe("DISCOVERY_LOCATION_REQUIRED");

    const privateLocationAttempt = await request(fixture.app).get(
      "/api/v1/requests/discover?mode=nearby&province=Cebu&barangay=Lahug",
    );
    expect(privateLocationAttempt.status).toBe(422);
    expect(privateLocationAttempt.body.error.code).toBe("VALIDATION_ERROR");
  });
});
