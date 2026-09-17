import { createPrivacyRequestController } from "../controllers/privacyRequest.controller.js";
import { PrivacyRequestRepository } from "../repositories/privacyRequest.repository.js";
import { createPrivacyRequestRouters } from "../routes/privacyRequest.routes.js";
import { PrivacyRequestService } from "../services/privacyRequest.service.js";
import { privacyRequestSchemas } from "../validators/privacyRequest.schemas.js";

export function createPrivacyRequestModule(config, authService) {
  const repository = new PrivacyRequestRepository();
  const service = new PrivacyRequestService({ repository, config });
  const routers = createPrivacyRequestRouters({
    controller: createPrivacyRequestController(service),
    schemas: privacyRequestSchemas,
    authService,
  });
  return Object.freeze({ ...routers, service });
}
