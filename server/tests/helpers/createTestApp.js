import { createApp } from "../../src/app.js";
import { createLogger } from "../../src/config/logger.js";

export const testConfig = Object.freeze({
  environment: "test",
  corsOrigins: Object.freeze(["http://localhost:8081"]),
  trustProxy: 0,
  jsonBodyLimit: "1mb",
  rateLimitWindowMs: 60000,
  rateLimitMax: 200,
  authRateLimitWindowMs: 60000,
  authRateLimitMax: 100,
  emailActionRateLimitMax: 100,
  offerRateLimitWindowMs: 60000,
  offerRateLimitMax: 100,
  messageRateLimitWindowMs: 60000,
  messageRateLimitMax: 100,
  idempotencyTtlHours: 24,
  ipHashSecret: "test-ip-hash-secret-with-at-least-32-characters",
});

export function createTestApp(overrides = {}, options = {}) {
  const logger = createLogger({ level: "silent", environment: "test" });
  return createApp({
    config: { ...testConfig, ...overrides },
    logger,
    authRouter: options.authRouter,
    notificationRouter: options.notificationRouter,
    verificationRouter: options.verificationRouter,
    adminVerificationRouter: options.adminVerificationRouter,
    donationRouter: options.donationRouter,
    adminDonationRouter: options.adminDonationRouter,
    donationWebhookRouter: options.donationWebhookRouter,
    reportRouter: options.reportRouter,
    blockRouter: options.blockRouter,
    adminSafetyRouter: options.adminSafetyRouter,
    privacyRequestRouter: options.privacyRequestRouter,
    adminPrivacyRequestRouter: options.adminPrivacyRequestRouter,
    readinessCheck: options.readinessCheck,
  });
}
