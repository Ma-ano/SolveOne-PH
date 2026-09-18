import { AppError } from "../utils/AppError.js";
import { requestSuggestionJsonSchema } from "./openAiRequestStructuring.provider.js";

const endpoint = "https://api.groq.com/openai/v1/chat/completions";
const instructions =
  "Turn the user's sanitized description into a conservative help-request suggestion. Do not invent facts, quantities, prices, dates, urgency, identities, locations, eligibility, diagnoses, fraud conclusions, moderation decisions, payment actions, or identity-verification decisions. Ask follow-up questions for missing details. Return only the requested JSON object. This is an editable suggestion only.";

function unavailable() {
  return new AppError({
    statusCode: 503,
    code: "AI_ASSISTANCE_UNAVAILABLE",
    message:
      "AI assistance is temporarily unavailable. You can continue without it.",
  });
}

function extractOutput(payload) {
  const message = payload?.choices?.[0]?.message;
  if (message?.refusal) throw unavailable();
  if (typeof message?.content !== "string" || !message.content.trim()) {
    throw unavailable();
  }
  return message.content;
}

export class GroqRequestStructuringProvider {
  constructor(config, fetchFn = fetch) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  async structureRequest({ description }) {
    const body = {
      model: this.config.groqModel,
      max_completion_tokens: 1200,
      messages: [
        { role: "system", content: instructions },
        {
          role: "user",
          content: JSON.stringify({
            task: "structure_request",
            description,
          }),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
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
          Authorization: `Bearer ${this.config.groqApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.aiProviderTimeoutMs),
      });
    } catch {
      throw unavailable();
    }

    if (!response.ok) throw unavailable();

    try {
      return JSON.parse(extractOutput(await response.json()));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw unavailable();
    }
  }
}
