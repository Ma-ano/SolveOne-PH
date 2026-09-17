import { createConversationController } from "../controllers/conversation.controller.js";
import { ConversationRepository } from "../repositories/conversation.repository.js";
import { createConversationRouters } from "../routes/conversation.routes.js";
import { ConversationService } from "../services/conversation.service.js";
import { conversationSchemas } from "../validators/conversation.schemas.js";

export function createConversationModule(config, authService, publisher) {
  const repository = new ConversationRepository();
  const conversationService = new ConversationService({
    repository,
    publisher,
  });
  const conversationController =
    createConversationController(conversationService);
  const routers = createConversationRouters({
    conversationController,
    conversationSchemas,
    authService,
    config,
  });
  return Object.freeze({ ...routers, conversationService });
}
