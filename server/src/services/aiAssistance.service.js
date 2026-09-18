import { createHmac } from "node:crypto";

import { aiRequestSuggestionSchema } from "../validators/aiAssistance.schemas.js";
import { AppError } from "../utils/AppError.js";
import {
  assessRequestSafety,
  safetyGuidanceFor,
} from "../utils/requestSafety.js";
import { sanitizeAiInput } from "../utils/sanitizeAiInput.js";

const DISCLAIMER =
  "AI-generated suggestion: review and edit every field. Nothing is saved or submitted until you explicitly do so.";

function assistanceError(statusCode, code, message, details) {
  return new AppError({ statusCode, code, message, details });
}

function asSafetyInput(description, suggestion = {}) {
  return {
    title: suggestion.title ?? "",
    description: suggestion.description ?? description,
    helpTypes: suggestion.helpTypes ?? [],
    needItems: suggestion.needItems ?? [],
  };
}

export class AiAssistanceService {
  constructor({ config, provider }) {
    this.config = config;
    this.provider = provider;
  }

  status() {
    return Object.freeze({ available: this.config.aiAssistanceEnabled });
  }

  async structureRequest(userId, input) {
    if (!this.config.aiAssistanceEnabled) {
      throw assistanceError(
        503,
        "AI_ASSISTANCE_DISABLED",
        "AI assistance is not enabled. You can continue creating your request manually.",
      );
    }

    const rawFlags = assessRequestSafety(asSafetyInput(input.description));
    if (rawFlags.length) {
      throw assistanceError(
        422,
        "AI_ASSISTANCE_UNSUPPORTED",
        "AI assistance cannot process this description. You can continue manually or seek immediate help when appropriate.",
        safetyGuidanceFor(rawFlags).map((message) => ({ message })),
      );
    }

    const { sanitized, redactions } = sanitizeAiInput(input.description);
    const meaningfulText = sanitized.replace(/\[removed [^\]]+\]/g, "").trim();
    if (meaningfulText.length < 20) {
      throw assistanceError(
        422,
        "AI_DESCRIPTION_INSUFFICIENT",
        "Add more non-sensitive detail before requesting an AI suggestion.",
      );
    }

    const safetyIdentifier = createHmac(
      "sha256",
      this.config.aiSafetyIdentifierSecret,
    )
      .update(String(userId))
      .digest("hex");
    const output = await this.provider.structureRequest({
      description: sanitized,
      safetyIdentifier,
    });
    const parsed = aiRequestSuggestionSchema.safeParse(output);
    if (!parsed.success) {
      throw assistanceError(
        503,
        "AI_ASSISTANCE_UNAVAILABLE",
        "AI assistance is temporarily unavailable. You can continue without it.",
      );
    }
    const outputFlags = assessRequestSafety(asSafetyInput("", parsed.data));
    if (outputFlags.length) {
      throw assistanceError(
        503,
        "AI_ASSISTANCE_UNAVAILABLE",
        "AI assistance is temporarily unavailable. You can continue without it.",
      );
    }

    return Object.freeze({
      suggestion: parsed.data,
      redactions,
      disclaimer: DISCLAIMER,
    });
  }
}
