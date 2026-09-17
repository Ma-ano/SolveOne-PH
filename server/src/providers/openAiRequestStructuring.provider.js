import { AppError } from "../utils/AppError.js";

const endpoint = "https://api.openai.com/v1/responses";

export const requestSuggestionJsonSchema = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: [
    "title",
    "description",
    "category",
    "helpTypes",
    "needItems",
    "requiredSkills",
    "followUpQuestions",
  ],
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    category: {
      type: "string",
      enum: [
        "education",
        "food",
        "health",
        "housing",
        "livelihood",
        "transportation",
        "digital_alalay",
        "electronics",
        "clothing",
        "books",
        "mobility",
        "household",
        "other",
      ],
    },
    helpTypes: {
      type: "array",
      items: { type: "string", enum: ["money", "item", "skill", "time"] },
    },
    needItems: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "type"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          type: {
            type: "string",
            enum: ["money", "item", "skill", "time"],
          },
        },
      },
    },
    requiredSkills: {
      type: "array",
      items: { type: "string" },
    },
    followUpQuestions: {
      type: "array",
      items: { type: "string" },
    },
  },
});

function unavailable() {
  return new AppError({
    statusCode: 503,
    code: "AI_ASSISTANCE_UNAVAILABLE",
    message:
      "AI assistance is temporarily unavailable. You can continue without it.",
  });
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }
  const parts = [];
  for (const output of payload?.output ?? []) {
    for (const content of output?.content ?? []) {
      if (content?.type === "refusal") throw unavailable();
      if (content?.type === "output_text" && typeof content.text === "string") {
        parts.push(content.text);
      }
    }
  }
  return parts.join("").trim();
}

export class OpenAiRequestStructuringProvider {
  constructor(config, fetchFn = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  async structureRequest({ description, safetyIdentifier }) {
    const body = {
      model: this.config.openAiModel,
      store: false,
      max_output_tokens: 1200,
      tools: [],
      tool_choice: "none",
      safety_identifier: safetyIdentifier,
      instructions:
        "Turn the user's sanitized description into a conservative help-request suggestion. Do not invent facts, quantities, prices, dates, urgency, identities, locations, eligibility, diagnoses, fraud conclusions, moderation decisions, payment actions, or identity-verification decisions. Ask follow-up questions for missing details. This is an editable suggestion only.",
      input: JSON.stringify({
        task: "structure_request",
        description,
      }),
      text: {
        format: {
          type: "json_schema",
          name: "solveone_request_suggestion",
          strict: true,
          schema: requestSuggestionJsonSchema,
        },
      },
    };
    let response;
    try {
      response = await this.fetchFn(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.aiProviderTimeoutMs),
      });
    } catch {
      throw unavailable();
    }
    if (!response.ok) throw unavailable();
    let payload;
    try {
      payload = await response.json();
      const output = extractOutputText(payload);
      if (!output) throw unavailable();
      return JSON.parse(output);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unavailable();
    }
  }
}
