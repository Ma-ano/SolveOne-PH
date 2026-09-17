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
      deviceName: `${firstName} test browser`,
      platform: "web",
    },
    { ipAddress: "203.0.113.60" },
  );
  return { user, authorization: `Bearer ${session.accessToken}` };
}

async function actors() {
  const fixture = createAuthFixture();
  const donor = await createUser(
    fixture,
    "Donor",
    "giveaway-donor@example.com",
  );
  const recipient = await createUser(
    fixture,
    "Recipient",
    "giveaway-recipient@example.com",
  );
  const other = await createUser(
    fixture,
    "Other",
    "giveaway-other@example.com",
  );
  const moderator = await createUser(
    fixture,
    "Moderator",
    "giveaway-moderator@example.com",
  );
  fixture.repository.users.get(moderator.user.id).role = "moderator";
  return { fixture, donor, recipient, other, moderator };
}

function requestBody(title = "School keyboard needed for online classes") {
  return {
    title,
    description:
      "I need a working keyboard for online school activities and enrollment forms before the deadline.",
    category: "electronics",
    helpTypes: ["item"],
    urgency: "important",
    location: {
      country: "Philippines",
      province: "Cebu",
      city: "Cebu City",
      barangay: "Private recipient barangay",
    },
    neededBy: "2099-12-31",
    needItems: [
      {
        name: "USB keyboard",
        description: "A working USB keyboard compatible with a basic laptop",
        type: "item",
        quantity: 1,
        estimatedValueCentavos: 50000,
      },
    ],
    requiredSkills: [],
  };
}

async function publishRequest(fixture, owner, moderator, body = requestBody()) {
  const created = await request(fixture.app)
    .post("/api/v1/requests")
    .set("Authorization", owner.authorization)
    .send(body);
  expect(created.status).toBe(201);
  const requestId = created.body.data.request.id;
  const needItemId = created.body.data.request.needItems[0].id;
  expect(
    (
      await request(fixture.app)
        .post(`/api/v1/requests/${requestId}/submit`)
        .set("Authorization", owner.authorization)
        .send({})
    ).status,
  ).toBe(200);
  expect(
    (
      await request(fixture.app)
        .post(`/api/v1/admin/requests/${requestId}/approve`)
        .set("Authorization", moderator.authorization)
        .send({})
    ).status,
  ).toBe(200);
  return { requestId, needItemId };
}

function listingBody(overrides = {}) {
  return {
    title: "Working USB keyboard",
    description:
      "A clean working USB keyboard that I no longer use and would like to give away for free.",
    category: "electronics",
    condition: "good",
    quantity: 1,
    location: {
      country: "Philippines",
      province: "Cebu",
      city: "Cebu City",
      barangay: "Private donor barangay",
    },
    ...overrides,
  };
}

async function createListing(
  fixture,
  donor,
  body = listingBody(),
  key = "giveaway-create-key-0001",
) {
  return request(fixture.app)
    .post("/api/v1/giveaway-items")
    .set("Authorization", donor.authorization)
    .set("Idempotency-Key", key)
    .send(body);
}

describe("free-item giveaway API", () => {
  it("creates an idempotent free listing and exposes only general public location", async () => {
    const { fixture, donor } = await actors();
    const created = await createListing(fixture, donor);
    expect(created.status).toBe(201);
    expect(created.body.data.item).toMatchObject({
      title: "Working USB keyboard",
      quantity: 1,
      availableQuantity: 1,
      status: "available",
      location: {
        barangay: "Private donor barangay",
      },
    });
    expect(created.body.data.item).not.toHaveProperty("price");

    const replay = await createListing(fixture, donor);
    expect(replay.status).toBe(201);
    expect(replay.body.data.item.id).toBe(created.body.data.item.id);
    expect(fixture.giveawayRepository.items.size).toBe(1);

    const publicRead = await request(fixture.app).get(
      `/api/v1/giveaway-items/${created.body.data.item.id}`,
    );
    expect(publicRead.status).toBe(200);
    expect(publicRead.body.data.item).toMatchObject({
      publicLocation: { city: "Cebu City", province: "Cebu" },
      owner: { displayName: "Donor S." },
    });
    expect(publicRead.body.data.item).not.toHaveProperty("location");
    expect(JSON.stringify(publicRead.body)).not.toContain(
      "Private donor barangay",
    );
    expect(JSON.stringify(publicRead.body)).not.toContain("storageKey");

    const keyConflict = await createListing(
      fixture,
      donor,
      listingBody({ title: "A different keyboard" }),
    );
    expect(keyConflict.status).toBe(409);
    expect(keyConflict.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");

    const prohibited = await createListing(
      fixture,
      donor,
      listingBody({
        title: "Unused firearm",
        description:
          "An unused firearm that is being offered through this listing workflow.",
      }),
      "giveaway-create-key-0002",
    );
    expect(prohibited.status).toBe(422);
    expect(prohibited.body.error.code).toBe("GIVEAWAY_CONTENT_NOT_ALLOWED");
  });

  it("matches an owned listing to open needs in the same category", async () => {
    const { fixture, donor, recipient, moderator } = await actors();
    const { requestId, needItemId } = await publishRequest(
      fixture,
      recipient,
      moderator,
    );
    const created = await createListing(fixture, donor);
    const itemId = created.body.data.item.id;

    const matches = await request(fixture.app)
      .get(`/api/v1/giveaway-items/${itemId}/matches`)
      .set("Authorization", donor.authorization);
    expect(matches.status).toBe(200);
    expect(matches.body.data.items).toHaveLength(1);
    expect(matches.body.data.items[0]).toMatchObject({
      id: requestId,
      giveawayMatch: {
        needItems: [
          { id: needItemId, name: "USB keyboard", remainingQuantity: 1 },
        ],
        reasons: ["Same item category"],
      },
    });
    expect(matches.body.data.items[0]).not.toHaveProperty("location");

    const outsider = await request(fixture.app)
      .get(`/api/v1/giveaway-items/${itemId}/matches`)
      .set("Authorization", recipient.authorization);
    expect(outsider.status).toBe(404);
  });

  it("atomically reserves request capacity and completes only after both confirmations", async () => {
    const { fixture, donor, recipient, other, moderator } = await actors();
    const { requestId, needItemId } = await publishRequest(
      fixture,
      recipient,
      moderator,
    );
    const created = await createListing(fixture, donor);
    const itemId = created.body.data.item.id;
    const reserved = await request(fixture.app)
      .post(`/api/v1/giveaway-items/${itemId}/reservations`)
      .set("Authorization", recipient.authorization)
      .set("Idempotency-Key", "giveaway-reserve-key-0001")
      .send({ requestId, needItemId, quantity: 1 });
    expect(reserved.status).toBe(201);
    expect(reserved.body.data.reservation.status).toBe("reserved");
    const reservationId = reserved.body.data.reservation.id;
    const storedRequest = fixture.requestRepository.requests.get(requestId);
    expect(storedRequest.needItems[0]).toMatchObject({
      reservedQuantity: 1,
      solvedQuantity: 0,
    });

    const publicList = await request(fixture.app).get("/api/v1/giveaway-items");
    expect(publicList.status).toBe(200);
    expect(publicList.body.data.items).toEqual([]);

    const outsider = await request(fixture.app)
      .post(`/api/v1/giveaway-reservations/${reservationId}/confirm`)
      .set("Authorization", other.authorization)
      .set("Idempotency-Key", "giveaway-confirm-key-other")
      .send({});
    expect(outsider.status).toBe(404);

    const donorConfirmed = await request(fixture.app)
      .post(`/api/v1/giveaway-reservations/${reservationId}/confirm`)
      .set("Authorization", donor.authorization)
      .set("Idempotency-Key", "giveaway-confirm-key-donor")
      .send({});
    expect(donorConfirmed.status).toBe(200);
    expect(donorConfirmed.body.data.reservation).toMatchObject({
      status: "reserved",
      donorConfirmedAt: expect.any(String),
      recipientConfirmedAt: null,
    });
    const impactBefore = await request(fixture.app).get(
      `/api/v1/impact/users/${donor.user.id}`,
    );
    expect(impactBefore.body.data.impact.itemsDonated).toBe(0);

    const cannotCancel = await request(fixture.app)
      .post(`/api/v1/giveaway-reservations/${reservationId}/cancel`)
      .set("Authorization", recipient.authorization)
      .send({});
    expect(cannotCancel.status).toBe(409);
    expect(cannotCancel.body.error.code).toBe("GIVEAWAY_CONFIRMATION_STARTED");
    const cannotCancelRequest = await request(fixture.app)
      .post(`/api/v1/requests/${requestId}/cancel`)
      .set("Authorization", recipient.authorization)
      .send({});
    expect(cannotCancelRequest.status).toBe(409);
    expect(cannotCancelRequest.body.error.code).toBe("REQUEST_NOT_AVAILABLE");

    const recipientConfirmed = await request(fixture.app)
      .post(`/api/v1/giveaway-reservations/${reservationId}/confirm`)
      .set("Authorization", recipient.authorization)
      .set("Idempotency-Key", "giveaway-confirm-key-recipient")
      .send({});
    expect(recipientConfirmed.status).toBe(200);
    expect(recipientConfirmed.body.data.reservation.status).toBe("completed");
    expect(storedRequest.needItems[0]).toMatchObject({
      reservedQuantity: 0,
      solvedQuantity: 1,
    });
    expect(storedRequest.status).toBe("solved");
    expect(fixture.giveawayRepository.items.get(itemId)).toMatchObject({
      status: "given",
      reservedQuantity: 0,
      givenQuantity: 1,
    });

    const impact = await request(fixture.app).get(
      `/api/v1/impact/users/${donor.user.id}`,
    );
    expect(impact.status).toBe(200);
    expect(impact.body.data.impact).toMatchObject({
      problemsSolved: 1,
      itemsDonated: 1,
    });
  });

  it("allows only one final reservation and releases both counters on cancellation", async () => {
    const { fixture, donor, recipient, other, moderator } = await actors();
    const firstNeed = await publishRequest(fixture, recipient, moderator);
    const secondNeed = await publishRequest(
      fixture,
      other,
      moderator,
      requestBody("A second keyboard need for schoolwork"),
    );
    const created = await createListing(fixture, donor);
    const itemId = created.body.data.item.id;
    const attempts = await Promise.all([
      request(fixture.app)
        .post(`/api/v1/giveaway-items/${itemId}/reservations`)
        .set("Authorization", recipient.authorization)
        .set("Idempotency-Key", "giveaway-race-key-recipient")
        .send({ ...firstNeed, quantity: 1 }),
      request(fixture.app)
        .post(`/api/v1/giveaway-items/${itemId}/reservations`)
        .set("Authorization", other.authorization)
        .set("Idempotency-Key", "giveaway-race-key-other-user")
        .send({ ...secondNeed, quantity: 1 }),
    ]);
    expect(attempts.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    const winner = attempts.find((response) => response.status === 201);
    const winnerAuth =
      winner.body.data.reservation.recipientId === recipient.user.id
        ? recipient.authorization
        : other.authorization;
    const cancelled = await request(fixture.app)
      .post(
        `/api/v1/giveaway-reservations/${winner.body.data.reservation.id}/cancel`,
      )
      .set("Authorization", winnerAuth)
      .send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.reservation.status).toBe("cancelled");
    expect(fixture.giveawayRepository.items.get(itemId)).toMatchObject({
      status: "available",
      reservedQuantity: 0,
      givenQuantity: 0,
    });
    const winningRequest = fixture.requestRepository.requests.get(
      winner.body.data.reservation.requestId,
    );
    expect(winningRequest.needItems[0].reservedQuantity).toBe(0);
  });

  it("releases untouched giveaway reservations when the recipient cancels the request", async () => {
    const { fixture, donor, recipient, moderator } = await actors();
    const need = await publishRequest(fixture, recipient, moderator);
    const created = await createListing(fixture, donor);
    const itemId = created.body.data.item.id;
    const reserved = await request(fixture.app)
      .post(`/api/v1/giveaway-items/${itemId}/reservations`)
      .set("Authorization", recipient.authorization)
      .set("Idempotency-Key", "giveaway-cancel-request-reserve")
      .send({ ...need, quantity: 1 });
    expect(reserved.status).toBe(201);

    const cancelled = await request(fixture.app)
      .post(`/api/v1/requests/${need.requestId}/cancel`)
      .set("Authorization", recipient.authorization)
      .send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.request.status).toBe("cancelled");
    expect(
      fixture.giveawayRepository.reservationRecords.get(
        reserved.body.data.reservation.id,
      ).status,
    ).toBe("cancelled");
    expect(fixture.giveawayRepository.items.get(itemId)).toMatchObject({
      status: "available",
      reservedQuantity: 0,
    });
    expect(
      fixture.requestRepository.requests.get(need.requestId).needItems[0]
        .reservedQuantity,
    ).toBe(0);
  });
});
