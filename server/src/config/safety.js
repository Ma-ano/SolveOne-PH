import { createSafetyController } from "../controllers/safety.controller.js";
import { SafetyRepository } from "../repositories/safety.repository.js";
import { createSafetyRouters } from "../routes/safety.routes.js";
import { SafetyService } from "../services/safety.service.js";
import { safetySchemas } from "../validators/safety.schemas.js";

export function createSafetyModule(config, authService) {
  const repository = new SafetyRepository();
  const service = new SafetyService({ repository, config });
  const routers = createSafetyRouters({
    controller: createSafetyController(service),
    schemas: safetySchemas,
    authService,
  });
  return Object.freeze({ ...routers, service });
}
