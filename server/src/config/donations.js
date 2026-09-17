import { createDonationController } from "../controllers/donation.controller.js";
import { PayMongoProvider } from "../providers/payMongo.provider.js";
import { DonationRepository } from "../repositories/donation.repository.js";
import { createDonationRouters } from "../routes/donation.routes.js";
import { DonationService } from "../services/donation.service.js";
import { donationSchemas } from "../validators/donation.schemas.js";

export function createDonationModule(config, authService) {
  const repository = new DonationRepository();
  const service = new DonationService({
    repository,
    provider: new PayMongoProvider(config),
    config,
  });
  const routers = createDonationRouters({
    controller: createDonationController(service),
    schemas: donationSchemas,
    authService,
  });
  return Object.freeze({ ...routers, service });
}
