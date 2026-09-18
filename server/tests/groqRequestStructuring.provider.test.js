import { describe, expect, it, vi } from "vitest";

import { GroqRequestStructuringProvider } from "../src/providers/groqRequestStructuring.provider.js";

const config = Object.freeze({
  groqApiKey: "gsk_fixture_server_secret_key_value",
  groqModel: "openai/gpt-oss-20b",
  aiProviderTimeoutMs: 8000,
});
const suggestion = Object.freeze({
  title: "School supply support for enrollment",
  description:
    "The requester needs a small set of school supplies so enrollment requirements can be completed.",
  category: "education",
  helpTypes: ["item"],
  needItems: [
    {
      name: "School supplies",
      description: "Basic school supplies for enrollment requirements.",
      type: "item",
    },
  ],
  requiredSkills: [],
  followUpQuestions: [],
});

describe("Groq request-structuring provider", () => {
  it("uses server-side credentials and strict structured output", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      async json() {
        return {
          choices: [{ message: { content: JSON.stringify(suggestion) } }],
        };
      },
    }));
    const provider = new GroqRequestStructuringProvider(config, fetchFn);
    const result = await provider.structureRequest({
      description: "I need help with school supplies.",
      safetyIdentifier: "a".repeat(64),
    });

    expect(result).toEqual(suggestion);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect(options.headers.Authorization).toBe(
      "Bearer gsk_fixture_server_secret_key_value",
    );
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      model: "openai/gpt-oss-20b",
      max_completion_tokens: 1200,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "solveone_request_suggestion",
          strict: true,
        },
      },
    });
    expect(body.messages).toEqual([
      expect.objectContaining({ role: "system" }),
      {
        role: "user",
        content: JSON.stringify({
          task: "structure_request",
          description: "I need help with school supplies.",
        }),
      },
    ]);
    expect(options.body).not.toContain("a".repeat(64));
  });

  it.each([
    ["network failure", async () => Promise.reject(new Error("secret"))],
    ["non-success response", async () => ({ ok: false })],
    [
      "malformed response",
      async () => ({ ok: true, json: async () => ({ choices: [] }) }),
    ],
    [
      "refusal response",
      async () => ({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "", refusal: "provider details" } }],
        }),
      }),
    ],
  ])("maps %s to a generic availability error", async (_label, fetchFn) => {
    const provider = new GroqRequestStructuringProvider(config, fetchFn);
    await expect(
      provider.structureRequest({
        description: "A sufficiently detailed sanitized description.",
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "AI_ASSISTANCE_UNAVAILABLE",
      message:
        "AI assistance is temporarily unavailable. You can continue without it.",
    });
  });
});
