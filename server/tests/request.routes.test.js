import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createAuthFixture,
  registerAndVerify,
  validRegistration,
} from "./helpers/createAuthFixture.js";

const futureDate = "2099-12-31";
const requesterDevice = { deviceName: "Requester phone", platform: "android" };

function completeDraft(overrides = {}) {
  return {
    title: "School printing needed for enrollment",
    description:
      "I need to print the listed enrollment documents so I can submit a complete school application before the deadline.",
    category: "education",
    helpTypes: ["item"],
    urgency: "important",
    location: {
      country: "Philippines",
      province: "Cebu",
      city: "Cebu City",
      barangay: "Lahug",
    },
    neededBy: futureDate,
    needItems: [
      {
        name: "Printed enrollment documents",
        description: "Twenty black-and-white pages on short bond paper",
        type: "item",
        quantity: 20,
        estimatedValueCentavos: 10000,
      },
    ],
    requiredSkills: [],
    ...overrides,
  };
}

async function login(fixture, registration, device = requesterDevice) {
  return fixture.authService.login(
    { email: registration.email, password: registration.password, ...device },
    { ipAddress: "203.0.113.42" },
  );
}

async function createActors() {
  const fixture = createAuthFixture();
  await registerAndVerify(fixture);
  const requesterSession = await login(fixture, validRegistration);
  const moderatorRegistration = {
    ...validRegistration,
    firstName: "Lina",
    lastName: "Reyes",
    email: "moderator@example.com",
  };
  const moderator = await registerAndVerify(fixture, moderatorRegistration);
  fixture.repository.users.get(moderator.id).role = "moderator";
  const moderatorSession = await login(fixture, moderatorRegistration, {
    deviceName: "Moderator browser",
    platform: "web",
  });
  return { fixture, requesterSession, moderatorSession };
}

describe("help-request API", () => {
  it("keeps drafts private, validates submission, and rejects protected fields", async () => {
    const { fixture, requesterSession } = await createActors();
    const authorization = `Bearer ${requesterSession.accessToken}`;
    const created = await request(fixture.app)
      .post("/api/v1/requests")
      .set("Authorization", authorization)
      .send({ title: "A saved draft" });

    expect(created.status).toBe(201);
    expect(created.body.data.request.status).toBe("draft");
    const requestId = created.body.data.request.id;

    const publicRead = await request(fixture.app).get(
      `/api/v1/requests/${requestId}`,
    );
    expect(publicRead.status).toBe(404);

    const ownerRead = await request(fixture.app)
      .get(`/api/v1/requests/${requestId}`)
      .set("Authorization", authorization);
    expect(ownerRead.status).toBe(200);
    expect(ownerRead.body.data.request.location).toHaveProperty("barangay");

    const incomplete = await request(fixture.app)
      .post(`/api/v1/requests/${requestId}/submit`)
      .set("Authorization", authorization)
      .send({});
    expect(incomplete.status).toBe(422);
    expect(incomplete.body.error.code).toBe("REQUEST_INCOMPLETE");

    const protectedField = await request(fixture.app)
      .patch(`/api/v1/requests/${requestId}`)
      .set("Authorization", authorization)
      .send({ status: "published" });
    expect(protectedField.status).toBe(422);
  });

  it("publishes only through a different moderator and returns a privacy-safe DTO", async () => {
    const { fixture, requesterSession, moderatorSession } =
      await createActors();
    const requesterAuthorization = `Bearer ${requesterSession.accessToken}`;
    const moderatorAuthorization = `Bearer ${moderatorSession.accessToken}`;
    const created = await request(fixture.app)
      .post("/api/v1/requests")
      .set("Authorization", requesterAuthorization)
      .send(completeDraft());
    const requestId = created.body.data.request.id;
    const submitted = await request(fixture.app)
      .post(`/api/v1/requests/${requestId}/submit`)
      .set("Authorization", requesterAuthorization)
      .send({});

    expect(submitted.status).toBe(200);
    expect(submitted.body.data.request).toMatchObject({
      status: "pending_review",
      estimatedValueCentavos: 10000,
    });
    expect(submitted.body.data.request.publicLocation).toBeUndefined();

    const forbidden = await request(fixture.app)
      .post(`/api/v1/admin/requests/${requestId}/approve`)
      .set("Authorization", requesterAuthorization)
      .send({});
    expect(forbidden.status).toBe(403);

    const queue = await request(fixture.app)
      .get("/api/v1/admin/requests")
      .set("Authorization", moderatorAuthorization);
    expect(queue.status).toBe(200);
    expect(queue.body.data.items).toHaveLength(1);
    expect(queue.body.data.items[0].location.barangay).toBe("Lahug");

    const approved = await request(fixture.app)
      .post(`/api/v1/admin/requests/${requestId}/approve`)
      .set("Authorization", moderatorAuthorization)
      .send({});
    expect(approved.status).toBe(200);
    expect(approved.body.data.request.status).toBe("published");
    expect(fixture.requestRepository.auditLogs).toHaveLength(1);
    expect(fixture.requestRepository.auditLogs[0]).toMatchObject({
      action: "request_approved",
      targetType: "help_request",
    });
    expect(fixture.requestRepository.auditLogs[0].ipHash).not.toContain(
      "203.0.113",
    );

    const publicResponse = await request(fixture.app).get(
      `/api/v1/requests/${requestId}`,
    );
    expect(publicResponse.status).toBe(200);
    expect(publicResponse.body.data.request).toMatchObject({
      status: "published",
      publicLocation: { city: "Cebu City", province: "Cebu" },
      owner: { displayName: "Maria S." },
    });
    expect(publicResponse.body.data.request).not.toHaveProperty("location");
    expect(publicResponse.body.data.request).not.toHaveProperty("moderation");
    expect(publicResponse.body.data.request).not.toHaveProperty("safetyFlags");
    expect(publicResponse.body.data.request.owner).not.toHaveProperty(
      "lastName",
    );
  });

  it("prevents a moderator from reviewing their own request", async () => {
    const { fixture, requesterSession } = await createActors();
    const requesterId = requesterSession.user.id;
    fixture.repository.users.get(requesterId).role = "moderator";
    const authorization = `Bearer ${requesterSession.accessToken}`;
    const created = await request(fixture.app)
      .post("/api/v1/requests")
      .set("Authorization", authorization)
      .send(completeDraft());
    const requestId = created.body.data.request.id;
    await request(fixture.app)
      .post(`/api/v1/requests/${requestId}/submit`)
      .set("Authorization", authorization)
      .send({});

    const response = await request(fixture.app)
      .post(`/api/v1/admin/requests/${requestId}/approve`)
      .set("Authorization", authorization)
      .send({});
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN");
    expect(fixture.requestRepository.auditLogs).toHaveLength(0);
  });

  it("requires rejection notes and keeps rejected requests out of public reads", async () => {
    const { fixture, requesterSession, moderatorSession } =
      await createActors();
    const requesterAuthorization = `Bearer ${requesterSession.accessToken}`;
    const moderatorAuthorization = `Bearer ${moderatorSession.accessToken}`;
    const created = await request(fixture.app)
      .post("/api/v1/requests")
      .set("Authorization", requesterAuthorization)
      .send(completeDraft());
    const requestId = created.body.data.request.id;
    await request(fixture.app)
      .post(`/api/v1/requests/${requestId}/submit`)
      .set("Authorization", requesterAuthorization)
      .send({});

    const missingNotes = await request(fixture.app)
      .post(`/api/v1/admin/requests/${requestId}/reject`)
      .set("Authorization", moderatorAuthorization)
      .send({ notes: "Too vague" });
    expect(missingNotes.status).toBe(422);

    const rejected = await request(fixture.app)
      .post(`/api/v1/admin/requests/${requestId}/reject`)
      .set("Authorization", moderatorAuthorization)
      .send({
        notes:
          "This request asks for content that the platform cannot support.",
      });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.request.status).toBe("rejected");
    expect(fixture.requestRepository.auditLogs[0].action).toBe(
      "request_rejected",
    );

    const publicResponse = await request(fixture.app).get(
      `/api/v1/requests/${requestId}`,
    );
    expect(publicResponse.status).toBe(404);
  });

  it("rejects impossible calendar dates and enforces the configured combined value ceiling", async () => {
    const { fixture, requesterSession } = await createActors();
    const authorization = `Bearer ${requesterSession.accessToken}`;
    const impossibleDate = await request(fixture.app)
      .post("/api/v1/requests")
      .set("Authorization", authorization)
      .send(completeDraft({ neededBy: "2099-02-31" }));
    expect(impossibleDate.status).toBe(422);

    const overLimit = completeDraft({
      needItems: [
        {
          name: "Printed enrollment packet",
          description: "A complete packet required by the school registrar",
          type: "item",
          quantity: 1,
          estimatedValueCentavos: 600000,
        },
        {
          name: "Required reference books",
          description: "The two reference books listed by the school",
          type: "item",
          quantity: 2,
          estimatedValueCentavos: 600000,
        },
      ],
    });
    const created = await request(fixture.app)
      .post("/api/v1/requests")
      .set("Authorization", authorization)
      .send(overLimit);
    expect(created.status).toBe(201);
    expect(created.body.data.request.estimatedValueCentavos).toBe(1200000);

    const submitted = await request(fixture.app)
      .post(`/api/v1/requests/${created.body.data.request.id}/submit`)
      .set("Authorization", authorization)
      .send({});
    expect(submitted.status).toBe(422);
    expect(submitted.body.error.code).toBe("REQUEST_INCOMPLETE");
    expect(submitted.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: "needItems" })]),
    );
  });

  it("returns requested changes to the owner and permits a reviewed resubmission", async () => {
    const { fixture, requesterSession, moderatorSession } =
      await createActors();
    const requesterAuthorization = `Bearer ${requesterSession.accessToken}`;
    const moderatorAuthorization = `Bearer ${moderatorSession.accessToken}`;
    const created = await request(fixture.app)
      .post("/api/v1/requests")
      .set("Authorization", requesterAuthorization)
      .send(completeDraft());
    const requestId = created.body.data.request.id;
    await request(fixture.app)
      .post(`/api/v1/requests/${requestId}/submit`)
      .set("Authorization", requesterAuthorization)
      .send({});

    const changed = await request(fixture.app)
      .post(`/api/v1/admin/requests/${requestId}/request-changes`)
      .set("Authorization", moderatorAuthorization)
      .send({ notes: "Please explain which school office needs these pages." });
    expect(changed.status).toBe(200);
    expect(changed.body.data.request.status).toBe("changes_requested");

    const ownerList = await request(fixture.app)
      .get("/api/v1/requests/mine")
      .set("Authorization", requesterAuthorization);
    expect(ownerList.body.data.items[0].moderation.notes).toContain(
      "school office",
    );

    const edited = await request(fixture.app)
      .patch(`/api/v1/requests/${requestId}`)
      .set("Authorization", requesterAuthorization)
      .send({
        description:
          "I need to print the listed enrollment documents for the registrar so I can submit a complete application before the deadline.",
      });
    expect(edited.status).toBe(200);
    const resubmitted = await request(fixture.app)
      .post(`/api/v1/requests/${requestId}/submit`)
      .set("Authorization", requesterAuthorization)
      .send({});
    expect(resubmitted.body.data.request.status).toBe("pending_review");
    expect(fixture.requestRepository.auditLogs[0].action).toBe(
      "request_changes_requested",
    );
  });

  it("flags risky content for moderation and displays urgent professional guidance", async () => {
    const { fixture, requesterSession, moderatorSession } =
      await createActors();
    const created = await request(fixture.app)
      .post("/api/v1/requests")
      .set("Authorization", `Bearer ${requesterSession.accessToken}`)
      .send(
        completeDraft({
          description:
            "This is a medical emergency and someone asked me to provide an OTP code before they will help with the listed documents.",
        }),
      );
    const response = await request(fixture.app)
      .post(`/api/v1/requests/${created.body.data.request.id}/submit`)
      .set("Authorization", `Bearer ${requesterSession.accessToken}`)
      .send({});
    expect(response.status).toBe(200);
    expect(response.body.data.safetyGuidance[0]).toContain(
      "not an emergency service",
    );

    const queue = await request(fixture.app)
      .get("/api/v1/admin/requests")
      .set("Authorization", `Bearer ${moderatorSession.accessToken}`);
    expect(queue.body.data.items[0].safetyFlags).toEqual(
      expect.arrayContaining(["credential_request", "medical_emergency"]),
    );
  });

  it("uses bounded cursors tied to the active public filters", async () => {
    const { fixture, requesterSession, moderatorSession } =
      await createActors();
    const requesterAuthorization = `Bearer ${requesterSession.accessToken}`;
    const moderatorAuthorization = `Bearer ${moderatorSession.accessToken}`;

    for (const title of [
      "School documents for enrollment",
      "School notebooks for next term",
    ]) {
      const created = await request(fixture.app)
        .post("/api/v1/requests")
        .set("Authorization", requesterAuthorization)
        .send(completeDraft({ title }));
      await request(fixture.app)
        .post(`/api/v1/requests/${created.body.data.request.id}/submit`)
        .set("Authorization", requesterAuthorization)
        .send({});
      await request(fixture.app)
        .post(`/api/v1/admin/requests/${created.body.data.request.id}/approve`)
        .set("Authorization", moderatorAuthorization)
        .send({});
    }

    const first = await request(fixture.app).get("/api/v1/requests?limit=1");
    expect(first.body.data.items).toHaveLength(1);
    expect(first.body.data.pageInfo.hasNextPage).toBe(true);
    const cursor = first.body.data.pageInfo.nextCursor;

    const second = await request(fixture.app).get(
      `/api/v1/requests?limit=1&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(second.body.data.items).toHaveLength(1);
    expect(second.body.data.items[0].id).not.toBe(first.body.data.items[0].id);

    const wrongScope = await request(fixture.app).get(
      `/api/v1/requests?limit=1&category=education&cursor=${encodeURIComponent(cursor)}`,
    );
    expect(wrongScope.status).toBe(400);
    expect(wrongScope.body.error.code).toBe("INVALID_CURSOR");
  });
});
