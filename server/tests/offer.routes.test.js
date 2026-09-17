import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createAuthFixture,
  registerAndVerify,
  validRegistration,
} from "./helpers/createAuthFixture.js";

const futureDate = "2099-12-31";

function registration(firstName, email) {
  return {
    ...validRegistration,
    firstName,
    lastName: "Dela Cruz",
    email,
  };
}

async function login(fixture, actor, label) {
  return fixture.authService.login(
    {
      email: actor.email,
      password: actor.password,
      deviceName: `${label} browser`,
      platform: "web",
    },
    { ipAddress: "203.0.113.80" },
  );
}

function draftWithNeeds(needItems) {
  return {
    title: "Concrete school needs before enrollment closes",
    description:
      "I need the listed materials or assistance to finish an enrollment packet before the school registrar deadline.",
    category: "education",
    helpTypes: [...new Set(needItems.map((item) => item.type))],
    urgency: "important",
    location: {
      country: "Philippines",
      province: "Cebu",
      city: "Cebu City",
      barangay: "Lahug",
    },
    neededBy: futureDate,
    needItems,
    requiredSkills: [],
  };
}

function itemNeed(overrides = {}) {
  return {
    name: "Printed enrollment forms",
    description: "Printed forms on short bond paper for the registrar",
    type: "item",
    quantity: 2,
    estimatedValueCentavos: 10000,
    ...overrides,
  };
}

async function setupActors(configOverrides = {}) {
  const fixture = createAuthFixture(configOverrides);
  const ownerRegistration = registration("Ana", "owner@example.com");
  const helperRegistration = registration("Ben", "helper@example.com");
  const secondHelperRegistration = registration(
    "Cara",
    "helper-two@example.com",
  );
  const moderatorRegistration = registration(
    "Dina",
    "offer-moderator@example.com",
  );

  const owner = await registerAndVerify(fixture, ownerRegistration);
  const helper = await registerAndVerify(fixture, helperRegistration);
  const secondHelper = await registerAndVerify(
    fixture,
    secondHelperRegistration,
  );
  const moderator = await registerAndVerify(fixture, moderatorRegistration);
  fixture.repository.users.get(moderator.id).role = "moderator";

  const [ownerSession, helperSession, secondHelperSession, moderatorSession] =
    await Promise.all([
      login(fixture, ownerRegistration, "Owner"),
      login(fixture, helperRegistration, "Helper"),
      login(fixture, secondHelperRegistration, "Second helper"),
      login(fixture, moderatorRegistration, "Moderator"),
    ]);

  return {
    fixture,
    owner,
    helper,
    secondHelper,
    ownerAuthorization: `Bearer ${ownerSession.accessToken}`,
    helperAuthorization: `Bearer ${helperSession.accessToken}`,
    secondHelperAuthorization: `Bearer ${secondHelperSession.accessToken}`,
    moderatorAuthorization: `Bearer ${moderatorSession.accessToken}`,
  };
}

async function publishRequest(actors, needItems = [itemNeed()]) {
  const created = await request(actors.fixture.app)
    .post("/api/v1/requests")
    .set("Authorization", actors.ownerAuthorization)
    .send(draftWithNeeds(needItems));
  const requestId = created.body.data.request.id;
  await request(actors.fixture.app)
    .post(`/api/v1/requests/${requestId}/submit`)
    .set("Authorization", actors.ownerAuthorization)
    .send({});
  const approved = await request(actors.fixture.app)
    .post(`/api/v1/admin/requests/${requestId}/approve`)
    .set("Authorization", actors.moderatorAuthorization)
    .send({});
  return approved.body.data.request;
}

function itemOffer(needItemId, overrides = {}) {
  return {
    needItemId,
    helpType: "item",
    message: "I can provide these printed forms this week.",
    quantity: 1,
    ...overrides,
  };
}

describe("help-offer API", () => {
  it("creates a private participant offer and lists it for each authorized side", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors);
    const needItemId = published.needItems[0].id;

    const ownOffer = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.ownerAuthorization)
      .send(itemOffer(needItemId));
    expect(ownOffer.status).toBe(422);
    expect(ownOffer.body.error.code).toBe("SELF_OFFER_NOT_ALLOWED");

    const protectedField = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send({ ...itemOffer(needItemId), status: "accepted" });
    expect(protectedField.status).toBe(422);

    const created = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(itemOffer(needItemId));
    expect(created.status).toBe(201);
    expect(created.body.data.offer).toMatchObject({
      requestId: published.id,
      helperId: actors.helper.id,
      helpType: "item",
      quantity: 1,
      status: "pending",
      assistanceMode: "DIRECT_ASSISTANCE",
      helper: { displayName: "Ben D." },
      request: {
        title: published.title,
        owner: { displayName: "Ana D." },
      },
    });
    expect(created.body.data.offer).not.toHaveProperty("activeKey");
    expect(created.body.data.offer.request).not.toHaveProperty("location");

    const helperList = await request(actors.fixture.app)
      .get("/api/v1/offers/me")
      .set("Authorization", actors.helperAuthorization);
    expect(helperList.body.data.items).toHaveLength(1);

    const ownerList = await request(actors.fixture.app)
      .get(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.ownerAuthorization);
    expect(ownerList.status).toBe(200);
    expect(ownerList.body.data.items[0].helper.displayName).toBe("Ben D.");

    const concealed = await request(actors.fixture.app)
      .get(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.secondHelperAuthorization);
    expect(concealed.status).toBe(404);
  });

  it("accepts and starts only through the proper participant and makes retries idempotent", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors);
    const created = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(itemOffer(published.needItems[0].id));
    const offerId = created.body.data.offer.id;

    const unauthorized = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.secondHelperAuthorization)
      .set("Idempotency-Key", "unauthorized-accept-0001")
      .send({});
    expect(unauthorized.status).toBe(404);

    const missingKey = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .send({});
    expect(missingKey.status).toBe(400);
    expect(missingKey.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    const acceptKey = "owner-accept-offer-0001";
    const accepted = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", acceptKey)
      .send({});
    expect(accepted.status).toBe(200);
    expect(accepted.body.data.offer.status).toBe("accepted");
    expect(accepted.body.data.offer.acceptedAt).toBeTruthy();

    const acceptedRetry = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", acceptKey)
      .send({});
    expect(acceptedRetry.status).toBe(200);

    const publicRequest = await request(actors.fixture.app).get(
      `/api/v1/requests/${published.id}`,
    );
    expect(publicRequest.body.data.request.needItems[0]).toMatchObject({
      reservedQuantity: 1,
      remainingQuantity: 1,
      solvedQuantity: 0,
    });
    expect(publicRequest.body.data.request.status).toBe("published");

    const started = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/start`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    expect(started.status).toBe(200);
    expect(started.body.data.offer.status).toBe("in_progress");
    expect(started.body.data.offer.startedAt).toBeTruthy();

    const originalReplay = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", acceptKey)
      .send({});
    expect(originalReplay.status).toBe(200);
    expect(originalReplay.body.data.offer.status).toBe("accepted");

    const startedRetry = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/start`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    expect(startedRetry.status).toBe(200);

    const lateReject = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/reject`)
      .set("Authorization", actors.ownerAuthorization)
      .send({});
    expect(lateReject.status).toBe(409);
    expect(lateReject.body.error.code).toBe("OFFER_ALREADY_RESOLVED");
  });

  it("allows only one competing helper to reserve the final unit", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors, [itemNeed({ quantity: 1 })]);
    const body = itemOffer(published.needItems[0].id);
    const [first, second] = await Promise.all([
      request(actors.fixture.app)
        .post(`/api/v1/requests/${published.id}/offers`)
        .set("Authorization", actors.helperAuthorization)
        .send(body),
      request(actors.fixture.app)
        .post(`/api/v1/requests/${published.id}/offers`)
        .set("Authorization", actors.secondHelperAuthorization)
        .send(body),
    ]);

    const results = await Promise.all([
      request(actors.fixture.app)
        .post(`/api/v1/offers/${first.body.data.offer.id}/accept`)
        .set("Authorization", actors.ownerAuthorization)
        .set("Idempotency-Key", "competing-offer-accept-0001")
        .send({}),
      request(actors.fixture.app)
        .post(`/api/v1/offers/${second.body.data.offer.id}/accept`)
        .set("Authorization", actors.ownerAuthorization)
        .set("Idempotency-Key", "competing-offer-accept-0002")
        .send({}),
    ]);
    expect(results.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    expect(
      results.find((response) => response.status === 409).body.error.code,
    ).toBe("INSUFFICIENT_REMAINING_NEED");

    const acceptedIndex = results.findIndex(
      (response) => response.status === 200,
    );
    const offerIds = [first.body.data.offer.id, second.body.data.offer.id];
    const acceptKeys = [
      "competing-offer-accept-0001",
      "competing-offer-accept-0002",
    ];
    const keyReuse = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerIds[1 - acceptedIndex]}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", acceptKeys[acceptedIndex])
      .send({});
    expect(keyReuse.status).toBe(409);
    expect(keyReuse.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const current = await request(actors.fixture.app).get(
      `/api/v1/requests/${published.id}`,
    );
    expect(current.body.data.request.progress).toMatchObject({
      reservedQuantity: 1,
      solvedQuantity: 0,
    });
    expect(current.body.data.request.needItems[0].remainingQuantity).toBe(0);
  });

  it("supports withdraw and reject terminal decisions without locking future offers", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors);
    const body = itemOffer(published.needItems[0].id);
    const first = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(body);

    const withdrawn = await request(actors.fixture.app)
      .post(`/api/v1/offers/${first.body.data.offer.id}/withdraw`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    expect(withdrawn.body.data.offer.status).toBe("withdrawn");
    const withdrawnRetry = await request(actors.fixture.app)
      .post(`/api/v1/offers/${first.body.data.offer.id}/withdraw`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    expect(withdrawnRetry.status).toBe(200);

    const replacement = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(body);
    expect(replacement.status).toBe(201);
    const duplicate = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(body);
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.error.code).toBe("OFFER_ALREADY_ACTIVE");

    const rejected = await request(actors.fixture.app)
      .post(`/api/v1/offers/${replacement.body.data.offer.id}/reject`)
      .set("Authorization", actors.ownerAuthorization)
      .send({});
    expect(rejected.body.data.offer.status).toBe("rejected");
  });

  it("enforces blocks at acceptance and treats money help only as a pledge reservation", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors, [
      {
        name: "Enrollment fee pledge",
        description: "A pledge toward the documented school enrollment fee",
        type: "money",
        quantity: 1,
        estimatedValueCentavos: 50000,
      },
    ]);
    const created = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send({
        needItemId: published.needItems[0].id,
        helpType: "money",
        message: "I can pledge part of the documented enrollment fee.",
        pledgedValueCentavos: 20000,
      });
    expect(created.body.data.offer).toMatchObject({
      assistanceMode: "MONETARY_PLEDGE",
      pledgedValueCentavos: 20000,
      quantity: null,
    });
    expect(created.body.data.offer).not.toHaveProperty("wallet");
    expect(created.body.data.offer).not.toHaveProperty("transferId");

    actors.fixture.repository.users.get(actors.owner.id).accountStatus =
      "suspended";
    await expect(
      actors.fixture.offerService.accept(
        actors.owner.id,
        created.body.data.offer.id,
        "suspended-owner-accept-0001",
      ),
    ).rejects.toMatchObject({ code: "REQUEST_NOT_AVAILABLE" });
    actors.fixture.repository.users.get(actors.owner.id).accountStatus =
      "active";

    actors.fixture.offerRepository.block(actors.owner.id, actors.helper.id);
    const blocked = await request(actors.fixture.app)
      .post(`/api/v1/offers/${created.body.data.offer.id}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "blocked-offer-accept-0001")
      .send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("REQUEST_NOT_AVAILABLE");

    actors.fixture.offerRepository.blocks.clear();
    const accepted = await request(actors.fixture.app)
      .post(`/api/v1/offers/${created.body.data.offer.id}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "blocked-offer-accept-0001")
      .send({});
    expect(accepted.status).toBe(200);
    const current = await request(actors.fixture.app).get(
      `/api/v1/requests/${published.id}`,
    );
    expect(current.body.data.request.needItems[0]).toMatchObject({
      reservedValueCentavos: 20000,
      remainingValueCentavos: 30000,
      solvedValueCentavos: 0,
    });
  });

  it("cancels active offers and releases their reservations with the request", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors);
    const acceptedOffer = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(itemOffer(published.needItems[0].id));
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${acceptedOffer.body.data.offer.id}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "cancel-flow-accept-0001")
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.secondHelperAuthorization)
      .send(itemOffer(published.needItems[0].id));

    const cancelled = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/cancel`)
      .set("Authorization", actors.ownerAuthorization)
      .send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.request).toMatchObject({
      status: "cancelled",
      progress: { reservedQuantity: 0 },
    });

    const offers = await request(actors.fixture.app)
      .get(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.ownerAuthorization);
    expect(offers.body.data.items.map((offer) => offer.status)).toEqual([
      "cancelled",
      "cancelled",
    ]);
  });

  it("rate limits offer creation independently", async () => {
    const actors = await setupActors({ offerRateLimitMax: 1 });
    const published = await publishRequest(actors, [
      itemNeed(),
      itemNeed({
        name: "School notebooks",
        description: "Two notebooks required for the first school week",
      }),
    ]);
    const first = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(itemOffer(published.needItems[0].id));
    expect(first.status).toBe(201);

    const second = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(itemOffer(published.needItems[1].id));
    expect(second.status).toBe(429);
    expect(second.body.error.code).toBe("RATE_LIMITED");
  });

  it("keeps submitted evidence private and confirms partial progress exactly once", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors);
    const created = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(itemOffer(published.needItems[0].id));
    const offerId = created.body.data.offer.id;
    const earlyConfirmation = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/confirm`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "early-confirm-0001")
      .send({});
    expect(earlyConfirmation.status).toBe(409);
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "complete-flow-accept-0001")
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/start`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    const falseDuration = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/complete`)
      .set("Authorization", actors.helperAuthorization)
      .send({
        note: "The printed school forms were delivered to Ana.",
        actualMinutes: 90,
      });
    expect(falseDuration.status).toBe(422);
    const [first, second] = await Promise.all(
      [1, 2].map(() =>
        request(actors.fixture.app)
          .post(`/api/v1/offers/${offerId}/complete`)
          .set("Authorization", actors.helperAuthorization)
          .send({
            note: "I delivered the printed enrollment forms to the requester.",
          }),
      ),
    );
    expect([first.status, second.status]).toEqual([200, 200]);
    expect(actors.fixture.offerRepository.evidence.size).toBe(1);
    const hidden = await request(actors.fixture.app)
      .get(`/api/v1/offers/${offerId}/evidence`)
      .set("Authorization", actors.secondHelperAuthorization);
    expect(hidden.status).toBe(404);
    const visible = await request(actors.fixture.app)
      .get(`/api/v1/offers/${offerId}/evidence`)
      .set("Authorization", actors.ownerAuthorization);
    expect(visible.body.data.evidence.note).toContain(
      "printed enrollment forms",
    );
    const [confirmed, repeated] = await Promise.all(
      [1, 2].map((index) =>
        request(actors.fixture.app)
          .post(`/api/v1/offers/${offerId}/confirm`)
          .set("Authorization", actors.ownerAuthorization)
          .set("Idempotency-Key", `double-confirm-000${index}`)
          .send({}),
      ),
    );
    expect([confirmed.status, repeated.status]).toEqual([200, 200]);
    const current = await request(actors.fixture.app).get(
      `/api/v1/requests/${published.id}`,
    );
    expect(current.body.data.request).toMatchObject({
      status: "partially_solved",
      progress: { reservedQuantity: 0, solvedQuantity: 1 },
    });
    const platform = await request(actors.fixture.app).get("/api/v1/impact");
    expect(platform.body.data.impact.problemsSolved).toBe(0);
  });

  it("automatically solves the final need and cancels still-pending offers", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors, [itemNeed({ quantity: 1 })]);
    const [helperOffer, pendingOffer] = await Promise.all([
      request(actors.fixture.app)
        .post(`/api/v1/requests/${published.id}/offers`)
        .set("Authorization", actors.helperAuthorization)
        .send(itemOffer(published.needItems[0].id)),
      request(actors.fixture.app)
        .post(`/api/v1/requests/${published.id}/offers`)
        .set("Authorization", actors.secondHelperAuthorization)
        .send(itemOffer(published.needItems[0].id)),
    ]);
    const offerId = helperOffer.body.data.offer.id;
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "solve-accept-0001")
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/start`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/complete`)
      .set("Authorization", actors.helperAuthorization)
      .send({
        note: "I gave the verified school forms to Ana this afternoon.",
      });
    const confirmed = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/confirm`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "solve-confirm-0001")
      .send({});
    expect(confirmed.body.data.offer.status).toBe("completed");
    const replay = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/confirm`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "solve-confirm-0001")
      .send({});
    expect(replay.status).toBe(200);
    expect(replay.body.data).toEqual(confirmed.body.data);
    const missingKey = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/confirm`)
      .set("Authorization", actors.ownerAuthorization)
      .send({});
    expect(missingKey.status).toBe(400);
    const current = await request(actors.fixture.app).get(
      `/api/v1/requests/${published.id}`,
    );
    expect(current.body.data.request).toMatchObject({
      status: "solved",
      progress: { solvedQuantity: 1, reservedQuantity: 0 },
    });
    expect(current.body.data.request.solvedAt).toBeTruthy();
    const pending = await request(actors.fixture.app)
      .get(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.ownerAuthorization);
    expect(
      pending.body.data.items.find(
        (item) => item.id === pendingOffer.body.data.offer.id,
      ).status,
    ).toBe("cancelled");
    const lateAccept = await request(actors.fixture.app)
      .post(`/api/v1/offers/${pendingOffer.body.data.offer.id}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "late-solved-accept-0001")
      .send({});
    expect(lateAccept.status).toBe(409);
    const platform = await request(actors.fixture.app).get("/api/v1/impact");
    expect(platform.body.data.impact.problemsSolved).toBe(1);
    const helperImpact = await request(actors.fixture.app).get(
      `/api/v1/impact/users/${actors.helper.id}`,
    );
    expect(helperImpact.body.data.impact).toMatchObject({
      problemsSolved: 1,
      itemsDonated: 1,
    });
  });

  it("excludes disputed submissions from progress and impact and prevents cancellation", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors, [itemNeed({ quantity: 1 })]);
    const created = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(itemOffer(published.needItems[0].id));
    const offerId = created.body.data.offer.id;
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "dispute-accept-0001")
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/start`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/complete`)
      .set("Authorization", actors.helperAuthorization)
      .send({ note: "I delivered the forms requested in the offer." });
    actors.fixture.offerRepository.block(actors.owner.id, actors.helper.id);
    const disputed = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/dispute`)
      .set("Authorization", actors.ownerAuthorization)
      .send({ reason: "The printed forms were not the agreed school forms." });
    expect(disputed.body.data.offer.status).toBe("disputed");
    const confirm = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/confirm`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "disputed-confirm-0001")
      .send({});
    expect(confirm.status).toBe(409);
    const cancel = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/cancel`)
      .set("Authorization", actors.ownerAuthorization)
      .send({});
    expect(cancel.status).toBe(409);
    const current = await request(actors.fixture.app).get(
      `/api/v1/requests/${published.id}`,
    );
    expect(current.body.data.request.progress).toMatchObject({
      solvedQuantity: 0,
      reservedQuantity: 1,
    });
    expect(
      (await request(actors.fixture.app).get("/api/v1/impact")).body.data.impact
        .problemsSolved,
    ).toBe(0);
  });

  it("validates proof bytes and restricts upload and download to the offer participants", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors, [itemNeed({ quantity: 1 })]);
    const created = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send(itemOffer(published.needItems[0].id));
    const offerId = created.body.data.offer.id;
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "file-accept-0001")
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/start`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    const png = Buffer.from("89504e470d0a1a0a0000000049454e44", "hex");
    const upload = (
      authorization,
      bytes,
      mimeType = "image/png",
      name = "forms.png",
    ) =>
      request(actors.fixture.app)
        .post(`/api/v1/offers/${offerId}/evidence/uploads`)
        .set("Authorization", authorization)
        .set("Content-Type", "application/octet-stream")
        .set("X-Evidence-Mime-Type", mimeType)
        .set("X-Evidence-Name", encodeURIComponent(name))
        .send(bytes);
    expect((await upload(actors.ownerAuthorization, png)).status).toBe(404);
    expect(
      (
        await upload(
          actors.helperAuthorization,
          Buffer.from("<html>bad</html>"),
        )
      ).status,
    ).toBe(422);
    expect(
      (await upload(actors.helperAuthorization, png, "application/pdf")).status,
    ).toBe(422);
    const uploaded = await upload(actors.helperAuthorization, png);
    expect(uploaded.status).toBe(201);
    const fileId = uploaded.body.data.file.id;
    const badAttach = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/complete`)
      .set("Authorization", actors.helperAuthorization)
      .send({
        note: "The completed forms were delivered to the owner.",
        fileIds: ["ffffffffffffffffffffffff"],
      });
    expect(badAttach.status).toBe(422);
    const submitted = await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/complete`)
      .set("Authorization", actors.helperAuthorization)
      .send({
        note: "The completed forms were delivered to the owner.",
        fileIds: [fileId],
      });
    expect(submitted.status).toBe(200);
    expect(submitted.body.data.evidence.files).toMatchObject([
      { id: fileId, mimeType: "image/png" },
    ]);
    const concealed = await request(actors.fixture.app)
      .get(`/api/v1/offers/${offerId}/evidence/files/${fileId}`)
      .set("Authorization", actors.secondHelperAuthorization);
    expect(concealed.status).toBe(404);
    const fetched = await request(actors.fixture.app)
      .get(`/api/v1/offers/${offerId}/evidence/files/${fileId}`)
      .set("Authorization", actors.ownerAuthorization);
    expect(fetched.status).toBe(200);
    expect(fetched.headers["content-disposition"]).toContain("attachment");
    expect(fetched.headers["cache-control"]).toContain("no-store");
    expect(actors.fixture.offerRepository.evidenceAccessAudit).toHaveLength(1);
    expect(actors.fixture.offerRepository.evidenceAccessAudit[0]).toMatchObject(
      {
        fileId,
        participantId: actors.owner.id,
      },
    );
  });

  it("counts confirmed actual volunteer time, not an offer estimate", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors, [
      {
        name: "Enrollment form guidance",
        description:
          "One concrete form guidance session at the community center",
        type: "skill",
        quantity: 1,
        estimatedValueCentavos: 0,
      },
    ]);
    const created = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send({
        needItemId: published.needItems[0].id,
        helpType: "skill",
        message: "I can guide the requester through the enrollment forms.",
        quantity: 1,
        estimatedMinutes: 300,
      });
    const offerId = created.body.data.offer.id;
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "skill-accept-0001")
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/start`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/complete`)
      .set("Authorization", actors.helperAuthorization)
      .send({
        note: "I completed the form guidance session with Ana.",
        actualMinutes: 90,
      });
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/confirm`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "skill-confirm-0001")
      .send({});
    const impact = await request(actors.fixture.app).get(
      `/api/v1/impact/users/${actors.helper.id}`,
    );
    expect(impact.body.data.impact).toMatchObject({
      problemsSolved: 1,
      volunteerMinutes: 90,
      hoursVolunteered: 1.5,
      skillsProvided: 1,
    });
  });

  it("moves a confirmed money pledge by exact centavos without calling it funds raised", async () => {
    const actors = await setupActors();
    const published = await publishRequest(actors, [
      {
        name: "Documented school enrollment fee",
        description: "Two partial pledges can cover the documented fee",
        type: "money",
        quantity: 1,
        estimatedValueCentavos: 50000,
      },
    ]);
    const created = await request(actors.fixture.app)
      .post(`/api/v1/requests/${published.id}/offers`)
      .set("Authorization", actors.helperAuthorization)
      .send({
        needItemId: published.needItems[0].id,
        helpType: "money",
        message: "I can help with part of the school enrollment fee.",
        pledgedValueCentavos: 20000,
      });
    const offerId = created.body.data.offer.id;
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/accept`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "money-complete-accept-0001")
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/start`)
      .set("Authorization", actors.helperAuthorization)
      .send({});
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/complete`)
      .set("Authorization", actors.helperAuthorization)
      .send({ note: "I fulfilled the agreed partial fee pledge directly." });
    await request(actors.fixture.app)
      .post(`/api/v1/offers/${offerId}/confirm`)
      .set("Authorization", actors.ownerAuthorization)
      .set("Idempotency-Key", "money-complete-confirm-0001")
      .send({});
    const current = await request(actors.fixture.app).get(
      `/api/v1/requests/${published.id}`,
    );
    expect(current.body.data.request).toMatchObject({
      status: "partially_solved",
      needItems: [
        {
          reservedValueCentavos: 0,
          solvedValueCentavos: 20000,
          remainingValueCentavos: 30000,
        },
      ],
    });
    expect(
      (await request(actors.fixture.app).get("/api/v1/impact")).body.data
        .impact,
    ).toEqual({ problemsSolved: 0 });
  });
});
