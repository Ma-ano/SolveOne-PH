import { createAiAssistanceController } from "../controllers/aiAssistance.controller.js";
import { GroqRequestStructuringProvider } from "../providers/groqRequestStructuring.provider.js";
import { OpenAiRequestStructuringProvider } from "../providers/openAiRequestStructuring.provider.js";
import { createAiAssistanceRouter } from "../routes/aiAssistance.routes.js";
import { AiAssistanceService } from "../services/aiAssistance.service.js";
import { aiAssistanceSchemas } from "../validators/aiAssistance.schemas.js";

export function createAiAssistanceModule(config, authService, options = {}) {
  const provider =
    options.provider ??
    (config.aiProvider === "groq"
      ? new GroqRequestStructuringProvider(config)
      : new OpenAiRequestStructuringProvider(config));
  const service = new AiAssistanceService({ config, provider });
  const controller = createAiAssistanceController(service);
  const aiAssistanceRouter = createAiAssistanceRouter({
    controller,
    schemas: aiAssistanceSchemas,
    authService,
    config,
  });
  return Object.freeze({ aiAssistanceRouter, service });
}
