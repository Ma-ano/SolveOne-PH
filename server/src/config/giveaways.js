import { createGiveawayController } from "../controllers/giveaway.controller.js";
import { GiveawayRepository } from "../repositories/giveaway.repository.js";
import { createGiveawayRouters } from "../routes/giveaway.routes.js";
import { GiveawayService } from "../services/giveaway.service.js";
import { giveawaySchemas } from "../validators/giveaway.schemas.js";

export function createGiveawayModule(config, authService, publisher) {
  const repository = new GiveawayRepository();
  const service = new GiveawayService({ repository, config, publisher });
  const controller = createGiveawayController(service);
  return {
    ...createGiveawayRouters({
      controller,
      schemas: giveawaySchemas,
      authService,
      config,
    }),
    service,
  };
}
