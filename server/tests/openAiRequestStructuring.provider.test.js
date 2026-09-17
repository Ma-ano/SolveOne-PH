import { describe, expect, it, vi } from "vitest";

import { OpenAiRequestStructuringProvider } from "../src/providers/openAiRequestStructuring.provider.js";

const config = Object.freeze({
  openAiApiKey: "sk-server-secret-key",
  openAiModel: "configured-model",
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

describe("OpenAI request-structuring provider", () => {
  it("uses a non-stored, bounded, tool-free structured response request", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      async json() {
        return {
          output: [
            {
              content: [
                { type: "output_text", text: JSON.stringify(suggestion) },
              ],
            },
          ],
        };
      },
    }));
    const provider = new OpenAiRequestStructuringProvider(config, fetchFn);
    const result = await provider.structureRequest({
      description: "I need help with school supplies.",
      safetyIdentifier: "a".repeat(64),
    });

    expect(result).toEqual(suggestion);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, options] = fetchFn.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(options.headers.Authorization).toBe("Bearer sk-server-secret-key");
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({
      model: "configured-model",
      store: false,
      max_output_tokens: 1200,
      tools: [],
      tool_choice: "none",
      safety_identifier: "a".repeat(64),
      text: {
        format: {
          type: "json_schema",
          name: "solveone_request_suggestion",
          strict: true,
        },
      },
    });
    expect(body.input).toBe(
      JSON.stringify({
        task: "structure_request",
        description: "I need help with school supplies.",
      }),
    );
    expect(options.body).not.toContain("userId");
  });

  it.each([
    ["network failure", async () => Promise.reject(new Error("secret"))],
    ["non-success response", async () => ({ ok: false })],
    [
      "malformed response",
      async () => ({ ok: true, json: async () => ({ output: [] }) }),
    ],
    [
      "refusal response",
      async () => ({
        ok: true,
        json: async () => ({
          output: [{ content: [{ type: "refusal", refusal: "details" }] }],
        }),
      }),
    ],
  ])("maps %s to a generic availability error", async (_label, fetchFn) => {
    const provider = new OpenAiRequestStructuringProvider(config, fetchFn);
    await expect(
      provider.structureRequest({
        description: "A sufficiently detailed sanitized description.",
        safetyIdentifier: "b".repeat(64),
      }),
    ).rejects.toMatchObject({
      statusCode: 503,
      code: "AI_ASSISTANCE_UNAVAILABLE",
      message:
        "AI assistance is temporarily unavailable. You can continue without it.",
    });
  });
});
