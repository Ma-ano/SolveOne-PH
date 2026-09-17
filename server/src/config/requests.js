import { createRequestController } from "../controllers/request.controller.js";
import { RequestRepository } from "../repositories/request.repository.js";
import { createRequestRouters } from "../routes/request.routes.js";
import { RequestService } from "../services/request.service.js";
import { createRequestSchemas } from "../validators/request.schemas.js";

export function createRequestModule(config, authService, publisher) {
  const repository = new RequestRepository();
  const requestService = new RequestService({ repository, config, publisher });
  const requestController = createRequestController(requestService);
  const requestSchemas = createRequestSchemas(config);
  const routers = createRequestRouters({
    requestController,
    requestSchemas,
    authService,
  });

  return Object.freeze({ ...routers, requestService });
}
