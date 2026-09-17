import "dotenv/config";

import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createApp } from "./app.js";
import { createAiAssistanceModule } from "./config/aiAssistance.js";
import { createAuthModule } from "./config/auth.js";
import { createConversationModule } from "./config/conversations.js";
import { createDonationModule } from "./config/donations.js";
import {
  connectDatabase,
  databaseIsReady,
  disconnectDatabase,
} from "./config/database.js";
import { parseEnvironment } from "./config/env.js";
import { createLogger } from "./config/logger.js";
import { createGiveawayModule } from "./config/giveaways.js";
import { createMissionModule } from "./config/missions.js";
import { createOfferModule } from "./config/offers.js";
import { createNotificationModule } from "./config/notifications.js";
import { createVerificationModule } from "./config/verifications.js";
import { createRequestModule } from "./config/requests.js";
import { createSafetyModule } from "./config/safety.js";
import { createUserModule } from "./config/users.js";
import { RealtimePublisher } from "./realtime/RealtimePublisher.js";
import { createImpactRouter } from "./routes/impact.routes.js";
import {
  closeSocketServer,
  createSocketServer,
} from "./realtime/socketServer.js";

function listen(httpServer, port) {
  return new Promise((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(port, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });
}

function close(httpServer) {
  return new Promise((resolve, reject) => {
    if (!httpServer.listening) {
      resolve();
      return;
    }

    httpServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export async function startServer({ source = process.env } = {}) {
  const config = parseEnvironment(source);
  const logger = createLogger({
    level: config.logLevel,
    environment: config.environment,
  });

  if (config.mongoUri) {
    await connectDatabase({
      mongoUri: config.mongoUri,
      serverSelectionTimeoutMs: config.mongoServerSelectionTimeoutMs,
      environment: config.environment,
      logger,
    });
  }

  const { authRouter, authService } = createAuthModule(config, logger);
  const publisher = new RealtimePublisher();
  const { userRouter } = createUserModule(authService);
  const { aiAssistanceRouter } = createAiAssistanceModule(config, authService);
  const { requestRouter, adminRequestRouter } = createRequestModule(
    config,
    authService,
    publisher,
  );
  const { offerRouter, requestOfferRouter, evidenceStorage } =
    createOfferModule(config, authService, publisher);
  const { conversationRouter, messageRouter, conversationService } =
    createConversationModule(config, authService, publisher);
  const { notificationRouter } = createNotificationModule(
    authService,
    publisher,
  );
  const {
    reportRouter,
    blockRouter,
    adminRouter: adminSafetyRouter,
  } = createSafetyModule(config, authService);
  const {
    ownerRouter: donationRouter,
    adminRouter: adminDonationRouter,
    webhookRouter: donationWebhookRouter,
    service: donationService,
  } = createDonationModule(config, authService);
  const {
    ownerRouter: verificationRouter,
    adminRouter: adminVerificationRouter,
    service: verificationService,
    storage: verificationStorage,
  } = createVerificationModule(config, authService, publisher);
  const {
    itemRouter: giveawayItemRouter,
    reservationRouter: giveawayReservationRouter,
  } = createGiveawayModule(config, authService, publisher);
  const {
    missionRouter: communityMissionRouter,
    contributionRouter: missionContributionRouter,
    adminRouter: adminMissionRouter,
  } = createMissionModule(config, authService, publisher);
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
    impactRouter: createImpactRouter(),
    notificationRouter,
    verificationRouter,
    adminVerificationRouter,
    donationRouter,
    adminDonationRouter,
    donationWebhookRouter,
    reportRouter,
    blockRouter,
    adminSafetyRouter,
    giveawayItemRouter,
    giveawayReservationRouter,
    communityMissionRouter,
    missionContributionRouter,
    adminMissionRouter,
    aiAssistanceRouter,
    readinessCheck: () => !config.mongoUri || databaseIsReady(),
  });
  const httpServer = createServer(app);
  const socketServer = createSocketServer({
    httpServer,
    authService,
    conversationService,
    publisher,
    config,
    logger,
  });

  try {
    await listen(httpServer, config.port);
  } catch (error) {
    await closeSocketServer(socketServer);
    evidenceStorage.close();
    verificationStorage.close();
    await disconnectDatabase({ logger });
    throw error;
  }

  const address = httpServer.address();
  logger.info(
    {
      port: typeof address === "object" && address ? address.port : config.port,
    },
    "SolveOne API listening",
  );

  let cleanupTask = Promise.resolve();
  let cleanupRunning = false;
  const runEvidenceCleanup = () => {
    if (cleanupRunning) return;
    cleanupRunning = true;
    cleanupTask = evidenceStorage
      .cleanupExpired()
      .then((removed) => {
        if (removed)
          logger.info({ removed }, "Expired unattached evidence removed");
      })
      .catch((error) => {
        logger.error({ errorName: error.name }, "Evidence cleanup failed");
      })
      .finally(() => {
        cleanupRunning = false;
      });
  };
  const evidenceCleanupTimer = evidenceStorage.enabled
    ? setInterval(runEvidenceCleanup, 60 * 60 * 1000)
    : null;
  evidenceCleanupTimer?.unref();
  if (evidenceStorage.enabled) runEvidenceCleanup();

  let verificationTask = Promise.resolve();
  let verificationRunning = false;
  const runVerificationMaintenance = () => {
    if (verificationRunning) return;
    verificationRunning = true;
    verificationTask = verificationService
      .expirePending()
      .then((expired) =>
        verificationStorage
          .cleanupExpired()
          .then((removed) => ({ expired, removed })),
      )
      .then(({ expired, removed }) => {
        if (expired || removed)
          logger.info({ expired, removed }, "Identity documents maintained");
      })
      .catch((error) => {
        logger.error({ errorName: error.name }, "Identity cleanup failed");
      })
      .finally(() => {
        verificationRunning = false;
      });
  };
  const verificationTimer = verificationStorage.enabled
    ? setInterval(runVerificationMaintenance, 60 * 60 * 1000)
    : null;
  verificationTimer?.unref();
  if (verificationStorage.enabled) runVerificationMaintenance();

  let donationTask = Promise.resolve();
  let donationRunning = false;
  const runDonationMaintenance = () => {
    if (donationRunning) return;
    donationRunning = true;
    donationTask = donationService
      .applyDeferredRefunds()
      .then((applied) => {
        if (applied)
          logger.info({ applied }, "Deferred donation refunds reconciled");
      })
      .catch((error) => {
        logger.error(
          { errorName: error.name },
          "Donation reconciliation failed",
        );
      })
      .finally(() => {
        donationRunning = false;
      });
  };
  const donationTimer =
    config.paymentProvider === "paymongo"
      ? setInterval(runDonationMaintenance, 15 * 60 * 1000)
      : null;
  donationTimer?.unref();
  if (donationTimer) runDonationMaintenance();

  return {
    app,
    config,
    httpServer,
    socketServer,
    logger,
    async stop() {
      if (evidenceCleanupTimer) clearInterval(evidenceCleanupTimer);
      if (verificationTimer) clearInterval(verificationTimer);
      if (donationTimer) clearInterval(donationTimer);
      await closeSocketServer(socketServer);
      await close(httpServer);
      await cleanupTask;
      await verificationTask;
      await donationTask;
      evidenceStorage.close();
      verificationStorage.close();
      await disconnectDatabase({ logger });
    },
  };
}

async function run() {
  let runtime;

  try {
    runtime = await startServer();
  } catch (error) {
    const logger = createLogger({
      level: process.env.LOG_LEVEL || "info",
      environment: process.env.NODE_ENV || "development",
    });
    logger.fatal(
      {
        errorName: error.name,
        errorCode: error.code,
        issues: error.issues,
      },
      "SolveOne API failed to start",
    );
    process.exitCode = 1;
    return;
  }

  let shuttingDown = false;

  async function shutdown(signal) {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    runtime.logger.info({ signal }, "Graceful shutdown started");

    const forcedShutdown = setTimeout(() => {
      runtime.logger.error("Graceful shutdown timed out");
      runtime.httpServer.closeAllConnections?.();
      process.exitCode = 1;
    }, runtime.config.shutdownTimeoutMs);
    forcedShutdown.unref();

    try {
      await runtime.stop();
      clearTimeout(forcedShutdown);
      runtime.logger.info("Graceful shutdown completed");
    } catch (error) {
      clearTimeout(forcedShutdown);
      runtime.logger.error(
        { errorName: error.name },
        "Graceful shutdown failed",
      );
      process.exitCode = 1;
    }
  }

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (currentFile === invokedFile) {
  run();
}
