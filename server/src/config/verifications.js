import { createVerificationController } from "../controllers/verification.controller.js";
import { VerificationRepository } from "../repositories/verification.repository.js";
import { VerificationStorageRepository } from "../repositories/verificationStorage.repository.js";
import { createVerificationRouters } from "../routes/verification.routes.js";
import { VerificationService } from "../services/verification.service.js";
import { IdentityScanner } from "../utils/identityScanner.js";
import { verificationSchemas } from "../validators/verification.schemas.js";

export function createVerificationModule(config, authService, publisher) {
  const storage = new VerificationStorageRepository(config);
  const repository = new VerificationRepository({ storage });
  const service = new VerificationService({
    repository,
    scanner: new IdentityScanner(config),
    config,
    publisher,
  });
  const routers = createVerificationRouters({
    controller: createVerificationController(service),
    schemas: verificationSchemas,
    authService,
  });
  return Object.freeze({ ...routers, service, storage });
}
