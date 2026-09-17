import { createApp } from "../../src/app.js";
import { createAiAssistanceModule } from "../../src/config/aiAssistance.js";
import { createLogger } from "../../src/config/logger.js";
import { createAuthController } from "../../src/controllers/auth.controller.js";
import { createUserController } from "../../src/controllers/user.controller.js";
import { createOfferController } from "../../src/controllers/offer.controller.js";
import { createConversationController } from "../../src/controllers/conversation.controller.js";
import { createRequestController } from "../../src/controllers/request.controller.js";
import { createGiveawayController } from "../../src/controllers/giveaway.controller.js";
import { createMissionController } from "../../src/controllers/mission.controller.js";
import { createAuthRouter } from "../../src/routes/auth.routes.js";
import { createRequestRouters } from "../../src/routes/request.routes.js";
import { createOfferRouters } from "../../src/routes/offer.routes.js";
import { createImpactRouter } from "../../src/routes/impact.routes.js";
import { createGiveawayRouters } from "../../src/routes/giveaway.routes.js";
import { createMissionRouters } from "../../src/routes/mission.routes.js";
import { calculateUserImpact } from "../../src/utils/impact.js";
import { createConversationRouters } from "../../src/routes/conversation.routes.js";
import { createUserRouter } from "../../src/routes/user.routes.js";
import { AuthService } from "../../src/services/auth.service.js";
import { createTokenService } from "../../src/services/token.service.js";
import { UserService } from "../../src/services/user.service.js";
import { RequestService } from "../../src/services/request.service.js";
import { OfferService } from "../../src/services/offer.service.js";
import { ConversationService } from "../../src/services/conversation.service.js";
import { GiveawayService } from "../../src/services/giveaway.service.js";
import { MissionService } from "../../src/services/mission.service.js";
import { createRequestSchemas } from "../../src/validators/request.schemas.js";
import { createOfferSchemas } from "../../src/validators/offer.schemas.js";
import { conversationSchemas } from "../../src/validators/conversation.schemas.js";
import { giveawaySchemas } from "../../src/validators/giveaway.schemas.js";
import { missionSchemas } from "../../src/validators/mission.schemas.js";
import { FakeAuthRepository } from "./FakeAuthRepository.js";
import { FakeRequestRepository } from "./FakeRequestRepository.js";
import { FakeOfferRepository } from "./FakeOfferRepository.js";
import { FakeConversationRepository } from "./FakeConversationRepository.js";
import { FakeGiveawayRepository } from "./FakeGiveawayRepository.js";
import { FakeMissionRepository } from "./FakeMissionRepository.js";
import { testConfig } from "./createTestApp.js";

export const authTestConfig = Object.freeze({
  ...testConfig,
  frontendOrigin: "http://localhost:8081",
  jwtAccessSecret: "test-access-secret-with-at-least-32-characters",
  jwtRefreshSecret: "test-refresh-secret-with-at-least-32-characters",
  accessTokenTtlMinutes: 15,
  refreshTokenTtlDays: 30,
  passwordHashRounds: 10,
  ipHashSecret: "test-ip-hash-secret-with-at-least-32-characters",
  emailVerificationTtlMinutes: 60,
  passwordResetTtlMinutes: 30,
  refreshCookieName: "solveone_refresh",
  termsVersion: "2026-09-14",
  privacyVersion: "2026-09-14",
  accountClosurePolicyVersion: "2026-09-18",
  accountClosureNoticeUrl: "https://solveone.example/privacy/account-closure",
  maxRequestEstimatedValueCentavos: 1000000,
  maxRequestNeedItems: 20,
  offerRateLimitWindowMs: 60000,
  offerRateLimitMax: 100,
  messageRateLimitWindowMs: 60000,
  messageRateLimitMax: 100,
  idempotencyTtlHours: 24,
  aiAssistanceEnabled: false,
  aiProvider: "",
  openAiApiKey: "",
  openAiModel: "",
  aiSafetyIdentifierSecret:
    "test-ai-safety-identifier-secret-with-32-characters",
  aiRequestRateLimitWindowMs: 60000,
  aiRequestRateLimitMax: 100,
  aiProviderTimeoutMs: 10000,
});

export function createAuthFixture(configOverrides = {}, options = {}) {
  const config = { ...authTestConfig, ...configOverrides };
  const repository = new FakeAuthRepository();
  const sentEmails = { verification: [], passwordReset: [] };
  const emailService = {
    async sendEmailVerification(message) {
      sentEmails.verification.push(message);
    },
    async sendPasswordReset(message) {
      sentEmails.passwordReset.push(message);
    },
  };
  const logger = createLogger({ level: "silent", environment: "test" });
  const tokenService = createTokenService(config);
  const authService = new AuthService({
    repository,
    tokenService,
    emailService,
    config,
    logger,
  });
  const authController = createAuthController(authService, config);
  const authRouter = createAuthRouter({
    authController,
    authService,
    config,
  });
  const userService = new UserService({ repository });
  const userController = createUserController(userService);
  const userRouter = createUserRouter({ userController, authService });
  const { aiAssistanceRouter, service: aiAssistanceService } =
    createAiAssistanceModule(config, authService, {
      provider: options.aiProvider,
    });
  const requestRepository = new FakeRequestRepository(repository);
  const offerRepository = new FakeOfferRepository(
    repository,
    requestRepository,
  );
  const conversationRepository = new FakeConversationRepository(
    repository,
    requestRepository,
    offerRepository,
  );
  offerRepository.attachConversationRepository(conversationRepository);
  requestRepository.attachOfferRepository(offerRepository);
  const giveawayRepository = new FakeGiveawayRepository(
    repository,
    requestRepository,
  );
  const missionRepository = new FakeMissionRepository(repository);
  requestRepository.attachGiveawayRepository(giveawayRepository);
  const requestService = new RequestService({
    repository: requestRepository,
    config,
  });
  const requestController = createRequestController(requestService);
  const { requestRouter, adminRequestRouter } = createRequestRouters({
    requestController,
    requestSchemas: createRequestSchemas(config),
    authService,
  });
  const offerService = new OfferService({
    repository: offerRepository,
    config,
  });
  const offerController = createOfferController(offerService);
  const { offerRouter, requestOfferRouter } = createOfferRouters({
    offerController,
    offerSchemas: createOfferSchemas(config),
    authService,
    config,
  });
  const impactRouter = createImpactRouter({
    async platform() {
      return {
        problemsSolved:
          [...requestRepository.requests.values()].filter(
            (item) => item.status === "solved",
          ).length +
          [...missionRepository.missions.values()].filter(
            (item) => item.status === "completed",
          ).length,
      };
    },
    async forUser(userId) {
      if (repository.users.get(String(userId))?.accountStatus !== "active")
        return null;
      const completedOffers = [...offerRepository.offers.values()].filter(
        (offer) =>
          String(offer.helperId) === String(userId) &&
          offer.status === "completed",
      );
      const completedGiveaways = [
        ...giveawayRepository.reservationRecords.values(),
      ].filter(
        (record) =>
          String(record.donorId) === String(userId) &&
          record.status === "completed",
      );
      const ownedSolvedRequestIds = [...requestRepository.requests.values()]
        .filter(
          (item) =>
            String(item.ownerId) === String(userId) && item.status === "solved",
        )
        .map((item) => item._id);
      const completedMissionContributions = [
        ...missionRepository.contributions.values(),
      ].filter(
        (item) =>
          String(item.contributorId) === String(userId) &&
          item.status === "completed",
      );
      return calculateUserImpact({
        ownedSolvedRequestIds,
        completedOffers,
        completedGiveawayReservations: completedGiveaways,
        confirmedEvidence: [...offerRepository.evidence.values()].filter(
          (item) => item.confirmedAt,
        ),
        solvedRequestIds: [...requestRepository.requests.values()]
          .filter((item) => item.status === "solved")
          .map((item) => item._id),
        ownedCompletedMissionIds: [...missionRepository.missions.values()]
          .filter(
            (item) =>
              String(item.creatorId) === String(userId) &&
              item.status === "completed",
          )
          .map((item) => item._id),
        completedMissionContributions,
        completedMissionIds: [...missionRepository.missions.values()]
          .filter((item) => item.status === "completed")
          .map((item) => item._id),
      });
    },
  });
  const publishedRealtimeEvents = [];
  const publishedNotificationEvents = [];
  const publisher = {
    publishMessage(event) {
      publishedRealtimeEvents.push({ type: "message", ...event });
    },
    publishReadState(event) {
      publishedRealtimeEvents.push({ type: "read", ...event });
    },
    publishNotification(event) {
      publishedNotificationEvents.push(event);
    },
  };
  const giveawayService = new GiveawayService({
    repository: giveawayRepository,
    config,
    publisher,
  });
  const giveawayController = createGiveawayController(giveawayService);
  const {
    itemRouter: giveawayItemRouter,
    reservationRouter: giveawayReservationRouter,
  } = createGiveawayRouters({
    controller: giveawayController,
    schemas: giveawaySchemas,
    authService,
    config,
  });
  const missionService = new MissionService({
    repository: missionRepository,
    config,
    publisher,
  });
  const missionController = createMissionController(missionService);
  const {
    missionRouter: communityMissionRouter,
    contributionRouter: missionContributionRouter,
    adminRouter: adminMissionRouter,
  } = createMissionRouters({
    controller: missionController,
    schemas: missionSchemas,
    authService,
    config,
  });
  const conversationService = new ConversationService({
    repository: conversationRepository,
    publisher,
  });
  const conversationController =
    createConversationController(conversationService);
  const { conversationRouter, messageRouter } = createConversationRouters({
    conversationController,
    conversationSchemas,
    authService,
    config,
  });
  const app = createApp({
    config,
    logger,
    authRouter,
    userRouter,
    requestRouter,
    adminRequestRouter,
    offerRouter,
    requestOfferRouter,
    conversationRouter,
    messageRouter,
    impactRouter,
    giveawayItemRouter,
    giveawayReservationRouter,
    communityMissionRouter,
    missionContributionRouter,
    adminMissionRouter,
    aiAssistanceRouter,
  });

  return {
    app,
    authService,
    aiAssistanceService,
    repository,
    requestRepository,
    requestService,
    offerRepository,
    offerService,
    conversationRepository,
    conversationService,
    giveawayRepository,
    giveawayService,
    missionRepository,
    missionService,
    publishedNotificationEvents,
    publishedRealtimeEvents,
    sentEmails,
    tokenService,
    userService,
  };
}

export const validRegistration = Object.freeze({
  firstName: "Maria",
  lastName: "Santos",
  email: "Maria.Santos@example.com",
  password: "a-safe-password-123",
  passwordConfirmation: "a-safe-password-123",
  termsAccepted: true,
  privacyAccepted: true,
});

export async function registerAndVerify(
  fixture,
  registration = validRegistration,
) {
  const registrationResult = await fixture.authService.register(registration);
  const verificationToken = fixture.sentEmails.verification.at(-1).token;
  await fixture.authService.verifyEmail(verificationToken);
  return registrationResult.user;
}
