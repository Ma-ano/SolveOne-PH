import { createMissionController } from "../controllers/mission.controller.js";
import { MissionRepository } from "../repositories/mission.repository.js";
import { createMissionRouters } from "../routes/mission.routes.js";
import { MissionService } from "../services/mission.service.js";
import { missionSchemas } from "../validators/mission.schemas.js";

export function createMissionModule(config, authService, publisher) {
  const repository = new MissionRepository();
  const service = new MissionService({ repository, config, publisher });
  const controller = createMissionController(service);
  return {
    ...createMissionRouters({
      controller,
      schemas: missionSchemas,
      authService,
      config,
    }),
    service,
  };
}
