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
  const session = await fixture.authService.login(
    {
      email: actor.email,
      password: actor.password,
      deviceName: `${label} browser`,
      platform: "web",
    },
    { ipAddress: "203.0.113.91" },
  );
  return `Bearer ${session.accessToken}`;
}

async function setup(configOverrides = {}) {
  const fixture = createAuthFixture(configOverrides);
  const ownerRegistration = registration("Ana", "chat-owner@example.com");
  const helperRegistration = registration("Ben", "chat-helper@example.com");
  const outsiderRegistration = registration(
    "Cara",
    "chat-outsider@example.com",
  );
  const moderatorRegistration = registration(
    "Dina",
    "chat-moderator@example.com",
  );
  const owner = await registerAndVerify(fixture, ownerRegistration);
  const helper = await registerAndVerify(fixture, helperRegistration);
  const outsider = await registerAndVerify(fixture, outsiderRegistration);
  const moderator = await registerAndVerify(fixture, moderatorRegistration);
  fixture.repository.users.get(moderator.id).role = "moderator";
  const [ownerAuth, helperAuth, outsiderAuth, moderatorAuth] =
    await Promise.all([
      login(fixture, ownerRegistration, "Owner"),
      login(fixture, helperRegistration, "Helper"),
      login(fixture, outsiderRegistration, "Outsider"),
      login(fixture, moderatorRegistration, "Moderator"),
    ]);

  const created = await request(fixture.app)
    .post("/api/v1/requests")
    .set("Authorization", ownerAuth)
    .send({
      title: "Help completing an online public-service form",
      description:
        "I need screen-sharing guidance to prepare and submit a public-service form before its deadline.",
      category: "digital_alalay",
      helpTypes: ["skill"],
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
          name: "Guided online form session",
          description: "A guided session while I control my own account",
          type: "skill",
          quantity: 1,
          estimatedValueCentavos: 0,
        },
      ],
      requiredSkills: ["online forms"],
    });
  const requestId = created.body.data.request.id;
  await request(fixture.app)
    .post(`/api/v1/requests/${requestId}/submit`)
    .set("Authorization", ownerAuth)
    .send({});
  const approved = await request(fixture.app)
    .post(`/api/v1/admin/requests/${requestId}/approve`)
    .set("Authorization", moderatorAuth)
    .send({});
  const needItemId = approved.body.data.request.needItems[0].id;
  const offer = await request(fixture.app)
    .post(`/api/v1/requests/${requestId}/offers`)
    .set("Authorization", helperAuth)
    .send({
      needItemId,
      helpType: "skill",
      message: "I can guide the form session while you keep control.",
      quantity: 1,
      estimatedMinutes: 45,
    });
  return {
    fixture,
    owner,
    helper,
    outsider,
    ownerAuth,
    helperAuth,
    outsiderAuth,
    moderatorAuth,
    requestId,
    offerId: offer.body.data.offer.id,
  };
}

async function acceptOffer(actors) {
  const response = await request(actors.fixture.app)
    .post(`/api/v1/offers/${actors.offerId}/accept`)
    .set("Authorization", actors.ownerAuth)
    .set("Idempotency-Key", `accept-chat-${actors.offerId}`)
    .send({});
  expect(response.status).toBe(200);
  return response;
}

async function firstConversation(actors, authorization = actors.ownerAuth) {
  const response = await request(actors.fixture.app)
    .get("/api/v1/conversations")
    .set("Authorization", authorization);
  return response.body.data.items[0];
}

describe("relationship messaging API", () => {
  it("creates exactly one private Digital Alalay conversation on acceptance", async () => {
    const actors = await setup();
    expect(await firstConversation(actors)).toBeUndefined();
    await acceptOffer(actors);
    await acceptOffer(actors);

    const ownerConversation = await firstConversation(actors);
    const helperConversation = await firstConversation(
      actors,
      actors.helperAuth,
    );
    expect(ownerConversation.id).toBe(helperConversation.id);
    expect(ownerConversation).toMatchObject({
      requestId: actors.requestId,
      offerId: actors.offerId,
      status: "active",
      isDigitalAlalay: true,
      otherParticipant: { id: actors.helper.id, displayName: "Ben D." },
    });
    expect(ownerConversation.safetyNotice).toContain("Never share passwords");
    expect(ownerConversation.participants[0]).not.toHaveProperty("email");
    await expect(
      actors.fixture.conversationService.authorizeRealtime(
        actors.owner.id,
        ownerConversation.id,
      ),
    ).resolves.toEqual({ conversationId: ownerConversation.id });
    await expect(
      actors.fixture.conversationService.authorizeRealtime(
        actors.owner.id,
        ownerConversation.id.toUpperCase(),
      ),
    ).resolves.toEqual({ conversationId: ownerConversation.id });

    const outsider = await request(actors.fixture.app)
      .get(`/api/v1/conversations/${ownerConversation.id}/messages`)
      .set("Authorization", actors.outsiderAuth);
    expect(outsider.status).toBe(404);
    const moderator = await request(actors.fixture.app)
      .get(`/api/v1/conversations/${ownerConversation.id}/messages`)
      .set("Authorization", actors.moderatorAuth);
    expect(moderator.status).toBe(404);
  });

  it("persists and flags text before one realtime publication, with retry deduplication", async () => {
    const actors = await setup();
    await acceptOffer(actors);
    const conversation = await firstConversation(actors);
    const body = {
      type: "text",
      content: "Please send your OTP and banking PIN before we start.",
      clientMessageId: "client_message_00000001",
    };
    const created = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.helperAuth)
      .send(body);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      replayed: false,
      message: { type: "text", requiresCaution: true },
    });
    expect(created.body.data).not.toHaveProperty("safetyFlags");
    expect(actors.fixture.publishedRealtimeEvents).toHaveLength(1);
    expect(actors.fixture.conversationRepository.messages.size).toBe(1);

    const outsiderSend = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.outsiderAuth)
      .send({
        type: "text",
        content: "I should not be able to join this help relationship.",
        clientMessageId: "outsider_message_0000001",
      });
    expect(outsiderSend.status).toBe(404);

    const imageWithoutUpload = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.helperAuth)
      .send({
        type: "image",
        content: "A file",
        clientMessageId: "image_message_000000001",
      });
    expect(imageWithoutUpload.status).toBe(422);

    const forgedParticipant = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.helperAuth)
      .send({
        ...body,
        clientMessageId: "forged_message_00000001",
        senderId: actors.owner.id,
      });
    expect(forgedParticipant.status).toBe(422);

    const replay = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.helperAuth)
      .send(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.replayed).toBe(true);
    expect(actors.fixture.publishedRealtimeEvents).toHaveLength(1);
    expect(actors.fixture.conversationRepository.messages.size).toBe(1);

    const reused = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.helperAuth)
      .send({ ...body, content: "A different message" });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe("CLIENT_MESSAGE_ID_REUSED");
  });

  it("paginates messages, advances read state without regression, and deduplicates reports", async () => {
    const actors = await setup();
    await acceptOffer(actors);
    const conversation = await firstConversation(actors);
    for (const [index, content] of [
      "First update",
      "Second update",
    ].entries()) {
      const response = await request(actors.fixture.app)
        .post(`/api/v1/conversations/${conversation.id}/messages`)
        .set("Authorization", actors.helperAuth)
        .send({
          type: "text",
          content,
          clientMessageId: `client_message_page_0000${index}`,
        });
      expect(response.status).toBe(201);
    }

    const firstPage = await request(actors.fixture.app)
      .get(`/api/v1/conversations/${conversation.id}/messages?limit=1`)
      .set("Authorization", actors.ownerAuth);
    expect(firstPage.body.data.items).toHaveLength(1);
    expect(firstPage.body.data.pageInfo.hasNextPage).toBe(true);
    const newest = firstPage.body.data.items[0];
    const secondPage = await request(actors.fixture.app)
      .get(
        `/api/v1/conversations/${conversation.id}/messages?limit=1&cursor=${encodeURIComponent(firstPage.body.data.pageInfo.nextCursor)}`,
      )
      .set("Authorization", actors.ownerAuth);
    expect(secondPage.body.data.items[0].id).not.toBe(newest.id);

    const beforeRead = await firstConversation(actors);
    expect(beforeRead.unreadCount).toBe(2);
    const read = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/read`)
      .set("Authorization", actors.ownerAuth)
      .send({ messageId: newest.id });
    expect(read.status).toBe(200);
    expect(read.body.data.readState.lastReadMessageId).toBe(newest.id);
    const olderRead = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/read`)
      .set("Authorization", actors.ownerAuth)
      .send({ messageId: secondPage.body.data.items[0].id });
    expect(olderRead.body.data.readState.lastReadMessageId).toBe(newest.id);
    expect((await firstConversation(actors)).unreadCount).toBe(0);

    const reportBody = {
      reason: "credential_request",
      description: "The sender requested a credential in this conversation.",
    };
    const reported = await request(actors.fixture.app)
      .post(`/api/v1/messages/${newest.id}/report`)
      .set("Authorization", actors.ownerAuth)
      .send(reportBody);
    expect(reported.status).toBe(201);
    expect(reported.body.data.report).toMatchObject({
      targetType: "message",
      targetId: newest.id,
      status: "open",
    });
    expect(reported.body.data.report).not.toHaveProperty("conversationId");
    const duplicate = await request(actors.fixture.app)
      .post(`/api/v1/messages/${newest.id}/report`)
      .set("Authorization", actors.ownerAuth)
      .send(reportBody);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.duplicate).toBe(true);
    expect(actors.fixture.conversationRepository.reports.size).toBe(1);

    const senderReport = await request(actors.fixture.app)
      .post(`/api/v1/messages/${newest.id}/report`)
      .set("Authorization", actors.helperAuth)
      .send(reportBody);
    expect(senderReport.status).toBe(404);
    const outsiderReport = await request(actors.fixture.app)
      .post(`/api/v1/messages/${newest.id}/report`)
      .set("Authorization", actors.outsiderAuth)
      .send(reportBody);
    expect(outsiderReport.status).toBe(404);
  });

  it("applies a message-specific rate limit without affecting reads", async () => {
    const actors = await setup({ messageRateLimitMax: 1 });
    await acceptOffer(actors);
    const conversation = await firstConversation(actors);
    const first = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.helperAuth)
      .send({
        type: "text",
        content: "I can help with the form.",
        clientMessageId: "message_rate_limit_00001",
      });
    expect(first.status).toBe(201);
    const second = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.helperAuth)
      .send({
        type: "text",
        content: "Another quick update.",
        clientMessageId: "message_rate_limit_00002",
      });
    expect(second.status).toBe(429);
    const otherParticipant = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.ownerAuth)
      .send({
        type: "text",
        content: "Thanks for accepting the session.",
        clientMessageId: "owner_rate_limit_00001",
      });
    expect(otherParticipant.status).toBe(201);
    const read = await request(actors.fixture.app)
      .get(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.helperAuth);
    expect(read.status).toBe(200);
  });

  it("conceals unavailable messaging after a block or request cancellation", async () => {
    const actors = await setup();
    await acceptOffer(actors);
    const conversation = await firstConversation(actors);
    actors.fixture.offerRepository.block(actors.owner.id, actors.helper.id);
    await expect(
      actors.fixture.conversationService.authorizeRealtime(
        actors.helper.id,
        conversation.id,
      ),
    ).rejects.toMatchObject({
      statusCode: 404,
      code: "CONVERSATION_NOT_FOUND",
    });
    const blocked = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.helperAuth)
      .send({
        type: "text",
        content: "Can we continue?",
        clientMessageId: "client_message_blocked_01",
      });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("MESSAGING_UNAVAILABLE");
    expect(blocked.body.error.message).not.toMatch(/block/i);

    actors.fixture.offerRepository.blocks.clear();
    await request(actors.fixture.app)
      .post(`/api/v1/requests/${actors.requestId}/cancel`)
      .set("Authorization", actors.ownerAuth)
      .send({});
    const cancelled = await request(actors.fixture.app)
      .post(`/api/v1/conversations/${conversation.id}/messages`)
      .set("Authorization", actors.ownerAuth)
      .send({
        type: "text",
        content: "This should not send",
        clientMessageId: "client_message_cancelled1",
      });
    expect(cancelled.status).toBe(409);
    expect(cancelled.body.error.code).toBe("MESSAGING_UNAVAILABLE");
    await expect(
      actors.fixture.conversationService.authorizeRealtime(
        actors.owner.id,
        conversation.id,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
