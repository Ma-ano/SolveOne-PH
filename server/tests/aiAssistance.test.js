import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  createAuthFixture,
  registerAndVerify,
  validRegistration,
} from "./helpers/createAuthFixture.js";

const validSuggestion = Object.freeze({
  title: "School supply support for enrollment",
  description:
    "The requester needs a small set of school supplies so the enrollment requirements can be completed.",
  category: "education",
  helpTypes: ["item"],
  needItems: [
    {
      name: "School supplies",
      description: "Basic supplies needed to complete enrollment requirements.",
      type: "item",
    },
  ],
  requiredSkills: [],
  followUpQuestions: ["Which exact school supplies are still needed?"],
});

async function enabledFixture(provider, configOverrides = {}) {
  const fixture = createAuthFixture(
    {
      aiAssistanceEnabled: true,
      aiProvider: "openai",
      openAiApiKey: "sk-test-key-with-enough-characters",
      openAiModel: "configured-model",
      ...configOverrides,
    },
    { aiProvider: provider },
  );
  await registerAndVerify(fixture);
  const session = await fixture.authService.login({
    email: validRegistration.email,
    password: validRegistration.password,
    deviceName: "Requester browser",
    platform: "web",
  });
  return {
    fixture,
    authorization: `Bearer ${session.accessToken}`,
    userId: session.user.id,
  };
}

describe("AI request-structuring API", () => {
  it("reports availability without invoking the provider", async () => {
    const provider = { structureRequest: async () => validSuggestion };
    const { fixture, authorization } = await enabledFixture(provider);
    const enabled = await request(fixture.app)
      .get("/api/v1/ai/status")
      .set("Authorization", authorization);
    expect(enabled.status).toBe(200);
    expect(enabled.headers["cache-control"]).toBe("private, no-store");
    expect(enabled.body.data).toEqual({ available: true });

    const disabledFixture = createAuthFixture();
    await registerAndVerify(disabledFixture);
    const session = await disabledFixture.authService.login({
      email: validRegistration.email,
      password: validRegistration.password,
      deviceName: "Requester browser",
      platform: "web",
    });
    const disabled = await request(disabledFixture.app)
      .get("/api/v1/ai/status")
      .set("Authorization", `Bearer ${session.accessToken}`);
    expect(disabled.body.data).toEqual({ available: false });
  });

  it("requires authentication, explicit consent, and a strict request body", async () => {
    const provider = { structureRequest: async () => validSuggestion };
    const { fixture, authorization } = await enabledFixture(provider);
    const input = {
      description:
        "I need help organizing the school supplies required for enrollment.",
      consent: true,
    };

    expect(
      await request(fixture.app)
        .post("/api/v1/ai/request-structure")
        .send(input),
    ).toMatchObject({ status: 401 });
    expect(
      await request(fixture.app)
        .post("/api/v1/ai/request-structure")
        .set("Authorization", authorization)
        .send({ ...input, consent: false }),
    ).toMatchObject({ status: 422 });
    expect(
      await request(fixture.app)
        .post("/api/v1/ai/request-structure")
        .set("Authorization", authorization)
        .send({ ...input, ownerId: "protected" }),
    ).toMatchObject({ status: 422 });
  });

  it("redacts personal data and returns only an editable suggestion", async () => {
    const calls = [];
    const provider = {
      async structureRequest(input) {
        calls.push(input);
        return validSuggestion;
      },
    };
    const { fixture, authorization, userId } = await enabledFixture(provider);
    const before = fixture.requestRepository.requests.size;
    const sensitive =
      "I need help organizing school supplies for enrollment. Email me at maria@example.com or phone 0917 123 4567. My address is 12 Mabini Street. My TIN number is 123-456-789. Bank account number is 123456789012.";
    const response = await request(fixture.app)
      .post("/api/v1/ai/request-structure")
      .set("Authorization", authorization)
      .send({ description: sensitive, consent: true });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      suggestion: validSuggestion,
      disclaimer: expect.stringContaining("Nothing is saved"),
    });
    expect(response.body.data.redactions).toEqual(
      expect.arrayContaining([
        "email",
        "phone number",
        "precise address",
        "ID number",
        "payment information",
      ]),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].description).not.toContain("maria@example.com");
    expect(calls[0].description).not.toContain("0917 123 4567");
    expect(calls[0].description).not.toContain("12 Mabini Street");
    expect(calls[0].description).not.toContain("123-456-789");
    expect(calls[0].description).not.toContain("123456789012");
    expect(calls[0]).not.toHaveProperty("userId");
    expect(calls[0].safetyIdentifier).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[0].safetyIdentifier).not.toContain(userId);
    expect(fixture.requestRepository.requests.size).toBe(before);
  });

  it("rejects dangerous input before calling the provider", async () => {
    const calls = [];
    const { fixture, authorization } = await enabledFixture({
      async structureRequest(input) {
        calls.push(input);
        return validSuggestion;
      },
    });
    const response = await request(fixture.app)
      .post("/api/v1/ai/request-structure")
      .set("Authorization", authorization)
      .send({
        description:
          "I need a firearm and ammunition for an activity in the community.",
        consent: true,
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("AI_ASSISTANCE_UNSUPPORTED");
    expect(calls).toHaveLength(0);
  });

  it("rejects descriptions emptied by privacy redaction and rate-limits by user", async () => {
    const calls = [];
    const { fixture, authorization } = await enabledFixture(
      {
        async structureRequest(input) {
          calls.push(input);
          return validSuggestion;
        },
      },
      { aiRequestRateLimitMax: 2 },
    );
    const removed = await request(fixture.app)
      .post("/api/v1/ai/request-structure")
      .set("Authorization", authorization)
      .send({
        description: "Email maria@example.com and phone 09171234567 please.",
        consent: true,
      });
    expect(removed.status).toBe(422);
    expect(removed.body.error.code).toBe("AI_DESCRIPTION_INSUFFICIENT");
    expect(calls).toHaveLength(0);

    const accepted = await request(fixture.app)
      .post("/api/v1/ai/request-structure")
      .set("Authorization", authorization)
      .send({
        description:
          "I need help organizing the school supplies required for enrollment.",
        consent: true,
      });
    expect(accepted.status).toBe(200);
    const limited = await request(fixture.app)
      .post("/api/v1/ai/request-structure")
      .set("Authorization", authorization)
      .send({
        description:
          "I need help organizing the school supplies required for enrollment.",
        consent: true,
      });
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });

  it("rejects invalid or unsafe provider output with no provider details", async () => {
    const invalid = await enabledFixture({
      async structureRequest() {
        return { title: "Incomplete" };
      },
    });
    const input = {
      description:
        "I need help organizing the school supplies required for enrollment.",
      consent: true,
    };
    const invalidResponse = await request(invalid.fixture.app)
      .post("/api/v1/ai/request-structure")
      .set("Authorization", invalid.authorization)
      .send(input);
    expect(invalidResponse.status).toBe(503);
    expect(invalidResponse.body.error).toEqual({
      code: "AI_ASSISTANCE_UNAVAILABLE",
      message:
        "AI assistance is temporarily unavailable. You can continue without it.",
    });

    const unsafe = await enabledFixture({
      async structureRequest() {
        return {
          ...validSuggestion,
          description:
            "The requester needs a firearm and ammunition for an activity in the community.",
        };
      },
    });
    const unsafeResponse = await request(unsafe.fixture.app)
      .post("/api/v1/ai/request-structure")
      .set("Authorization", unsafe.authorization)
      .send(input);
    expect(unsafeResponse.status).toBe(503);
    expect(unsafeResponse.body.error.code).toBe("AI_ASSISTANCE_UNAVAILABLE");
  });

  it("stays optional when disabled while ordinary drafts continue to work", async () => {
    const fixture = createAuthFixture();
    await registerAndVerify(fixture);
    const session = await fixture.authService.login({
      email: validRegistration.email,
      password: validRegistration.password,
      deviceName: "Requester browser",
      platform: "web",
    });
    const authorization = `Bearer ${session.accessToken}`;
    const aiResponse = await request(fixture.app)
      .post("/api/v1/ai/request-structure")
      .set("Authorization", authorization)
      .send({
        description:
          "I need help organizing the school supplies required for enrollment.",
        consent: true,
      });
    expect(aiResponse.status).toBe(503);
    expect(aiResponse.body.error.code).toBe("AI_ASSISTANCE_DISABLED");

    const draft = await request(fixture.app)
      .post("/api/v1/requests")
      .set("Authorization", authorization)
      .send({ title: "Manual draft still works" });
    expect(draft.status).toBe(201);
    expect(draft.body.data.request.status).toBe("draft");
  });
});
