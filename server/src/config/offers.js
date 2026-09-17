import { createOfferController } from "../controllers/offer.controller.js";
import { OfferRepository } from "../repositories/offer.repository.js";
import { EvidenceStorageRepository } from "../repositories/evidenceStorage.repository.js";
import { createOfferRouters } from "../routes/offer.routes.js";
import { OfferService } from "../services/offer.service.js";
import { createOfferSchemas } from "../validators/offer.schemas.js";

export function createOfferModule(config, authService, publisher) {
  const repository = new OfferRepository({
    evidenceStorage: new EvidenceStorageRepository(config),
  });
  const offerService = new OfferService({ repository, config, publisher });
  const offerController = createOfferController(offerService);
  const offerSchemas = createOfferSchemas(config);
  const routers = createOfferRouters({
    offerController,
    offerSchemas,
    authService,
    config,
  });

  return Object.freeze({
    ...routers,
    offerService,
    evidenceStorage: repository.evidenceStorage,
  });
}
