import pino from "pino";

const redactedPaths = [
  "accessToken",
  "refreshToken",
  "token",
  "password",
  "passwordConfirmation",
  "otp",
  "pin",
  "cvv",
  "mongoUri",
  "MONGODB_URI",
  "storageAccessKeyId",
  "storageSecretAccessKey",
  "emailApiKey",
  "paymentSecretKey",
  "paymentWebhookSecret",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.accessToken",
  "req.body.refreshToken",
  "req.body.token",
  "req.body.password",
  "req.body.passwordConfirmation",
  "req.body.otp",
  "req.body.pin",
  "req.body.cvv",
  "res.headers.set-cookie",
];

export function createLogger({
  level = "info",
  environment = "development",
  destination,
} = {}) {
  const options = {
    level,
    base: {
      service: "solveone-api",
      environment,
    },
    redact: {
      paths: redactedPaths,
      censor: "[REDACTED]",
    },
  };

  return destination ? pino(options, destination) : pino(options);
}
