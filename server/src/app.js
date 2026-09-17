import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { createCorsOptions } from "./middleware/cors.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import { createHttpLogger } from "./middleware/httpLogger.js";
import { createGlobalRateLimiter } from "./middleware/rateLimiters.js";
import { requestId } from "./middleware/requestId.js";
import { createHealthRouter } from "./routes/health.routes.js";

export function createApp({
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
  readinessCheck,
}) {
  if (!config || !logger) {
    throw new Error("createApp requires validated config and a logger");
  }

  const app = express();

  app.disable("x-powered-by");

  if (config.trustProxy > 0) {
    app.set("trust proxy", config.trustProxy);
  }

  app.use(requestId);
  app.use(createHttpLogger(logger));
  app.use(helmet());
  app.use(cors(createCorsOptions(config.corsOrigins)));
  app.use(compression());
  app.use(cookieParser());

  // Payment signatures cover the exact raw bytes. Keep this route before both
  // JSON parsing and the general API limiter; it has its own bounded limiter.
  if (donationWebhookRouter) app.use("/api/v1/webhooks", donationWebhookRouter);

  app.use(
    createGlobalRateLimiter({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMax,
    }),
  );

  app.use(express.json({ limit: config.jsonBodyLimit }));
  app.use(express.urlencoded({ extended: false, limit: config.jsonBodyLimit }));

  app.use("/health", createHealthRouter({ readinessCheck }));

  if (authRouter) {
    app.use("/api/v1/auth", authRouter);
  }

  if (userRouter) {
    app.use("/api/v1/users", userRouter);
  }

  if (requestRouter) {
    app.use("/api/v1/requests", requestRouter);
  }

  if (requestOfferRouter) {
    app.use("/api/v1/requests", requestOfferRouter);
  }

  if (offerRouter) {
    app.use("/api/v1/offers", offerRouter);
  }

  if (conversationRouter) {
    app.use("/api/v1/conversations", conversationRouter);
  }

  if (messageRouter) {
    app.use("/api/v1/messages", messageRouter);
  }

  if (reportRouter) app.use("/api/v1/reports", reportRouter);

  if (blockRouter) app.use("/api/v1/blocks", blockRouter);

  if (giveawayItemRouter) app.use("/api/v1/giveaway-items", giveawayItemRouter);

  if (giveawayReservationRouter)
    app.use("/api/v1/giveaway-reservations", giveawayReservationRouter);

  if (communityMissionRouter)
    app.use("/api/v1/community-missions", communityMissionRouter);

  if (missionContributionRouter)
    app.use("/api/v1/mission-contributions", missionContributionRouter);

  if (impactRouter) app.use("/api/v1/impact", impactRouter);

  if (notificationRouter) app.use("/api/v1/notifications", notificationRouter);

  if (aiAssistanceRouter) app.use("/api/v1/ai", aiAssistanceRouter);

  if (donationRouter) app.use("/api/v1/platform-donations", donationRouter);

  if (adminDonationRouter)
    app.use("/api/v1/admin/platform-donations", adminDonationRouter);

  if (verificationRouter)
    app.use("/api/v1/verifications/identity", verificationRouter);

  if (adminVerificationRouter)
    app.use("/api/v1/admin/verifications/identity", adminVerificationRouter);

  if (adminRequestRouter) {
    app.use("/api/v1/admin/requests", adminRequestRouter);
  }

  if (adminMissionRouter)
    app.use("/api/v1/admin/community-missions", adminMissionRouter);

  if (adminSafetyRouter) app.use("/api/v1/admin/safety", adminSafetyRouter);

  app.use(notFound);
  app.use(errorHandler(config.environment));

  return app;
}
