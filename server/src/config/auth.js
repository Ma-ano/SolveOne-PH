import { createAuthController } from "../controllers/auth.controller.js";
import { AuthRepository } from "../repositories/auth.repository.js";
import { createAuthRouter } from "../routes/auth.routes.js";
import { AuthService } from "../services/auth.service.js";
import { createEmailService } from "../services/email.service.js";
import { createTokenService } from "../services/token.service.js";

export function createAuthModule(config, logger) {
  const repository = new AuthRepository();
  const tokenService = createTokenService(config);
  const emailService = createEmailService(config, logger);
  const authService = new AuthService({
    repository,
    tokenService,
    emailService,
    config,
    logger,
  });
  const authController = createAuthController(authService, config);
  const authRouter = createAuthRouter({ authController, authService, config });

  return Object.freeze({ authRouter, authService });
}
