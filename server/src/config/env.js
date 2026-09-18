import { z } from "zod";

const sourceSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(0).max(65535).default(5000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("info"),
  MONGODB_URI: z.string().trim().default(""),
  MONGODB_SERVER_SELECTION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(10000),
  FRONTEND_URL: z.string().trim().default("http://localhost:8081"),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  MOBILE_SCHEME: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9+.-]*$/, "MOBILE_SCHEME must be a valid URI scheme")
    .default("solveone"),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  JSON_BODY_LIMIT: z
    .string()
    .trim()
    .regex(/^\d+(?:b|kb|mb)$/i, "JSON_BODY_LIMIT must use b, kb, or mb units")
    .default("1mb"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(200),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().min(1000).default(900000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  EMAIL_ACTION_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(5),
  SHUTDOWN_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(60000)
    .default(10000),
  JWT_ACCESS_SECRET: z.string().default(""),
  JWT_REFRESH_SECRET: z.string().default(""),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(5).max(30).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  PASSWORD_HASH_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),
  IP_HASH_SECRET: z.string().default(""),
  EMAIL_PROVIDER: z.enum(["console", "resend"]).default("console"),
  EMAIL_FROM: z.string().email().default("no-reply@example.invalid"),
  EMAIL_API_KEY: z.string().default(""),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(10)
    .max(1440)
    .default(60),
  PASSWORD_RESET_TTL_MINUTES: z.coerce
    .number()
    .int()
    .min(10)
    .max(120)
    .default(30),
  REFRESH_COOKIE_NAME: z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/)
    .default("solveone_refresh"),
  TERMS_VERSION: z.string().trim().min(1).default("development"),
  PRIVACY_VERSION: z.string().trim().min(1).default("development"),
  ACCOUNT_CLOSURE_POLICY_VERSION: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .default("development"),
  ACCOUNT_CLOSURE_NOTICE_URL: z.string().trim().default(""),
  MAX_REQUEST_ESTIMATED_VALUE_CENTAVOS: z.coerce
    .number()
    .int()
    .min(10000)
    .max(100000000)
    .default(1000000),
  MAX_REQUEST_NEED_ITEMS: z.coerce.number().int().min(1).max(50).default(20),
  OFFER_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(3600000),
  OFFER_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  MESSAGE_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(60000),
  MESSAGE_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(60),
  EVIDENCE_UPLOAD_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(3600000),
  EVIDENCE_UPLOAD_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  IDEMPOTENCY_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  STORAGE_ENDPOINT: z.string().trim().default(""),
  STORAGE_REGION: z.string().trim().default(""),
  STORAGE_BUCKET: z.string().trim().default(""),
  STORAGE_ACCESS_KEY_ID: z.string().trim().default(""),
  STORAGE_SECRET_ACCESS_KEY: z.string().trim().default(""),
  IDENTITY_PROCESSING_ENABLED: z.enum(["true", "false"]).default("false"),
  IDENTITY_PRIVACY_NOTICE_VERSION: z.string().trim().max(50).default(""),
  IDENTITY_PRIVACY_NOTICE_URL: z.string().trim().default(""),
  IDENTITY_SCANNER_SOCKET: z.string().trim().default(""),
  IDENTITY_SCANNER_PORT: z.coerce.number().int().min(0).max(65535).default(0),
  PAYMENT_ENABLED: z.enum(["true", "false"]).default("false"),
  PAYMENT_PROVIDER: z.enum(["", "paymongo"]).default(""),
  PAYMENT_MODE: z.enum(["test", "live"]).default("test"),
  PAYMENT_SECRET_KEY: z.string().trim().default(""),
  PAYMENT_WEBHOOK_SECRET: z.string().trim().default(""),
  PAYMENT_METHOD_TYPES: z.string().trim().default("card,gcash,qrph"),
  AI_ASSISTANCE_ENABLED: z.enum(["true", "false"]).default("false"),
  AI_PROVIDER: z.enum(["", "openai", "groq"]).default(""),
  OPENAI_API_KEY: z.string().trim().default(""),
  OPENAI_MODEL: z.string().trim().default(""),
  GROQ_API_KEY: z.string().trim().default(""),
  GROQ_MODEL: z.string().trim().default(""),
  AI_SAFETY_IDENTIFIER_SECRET: z.string().default(""),
  AI_REQUEST_RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(3600000),
  AI_REQUEST_RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100).default(5),
  AI_PROVIDER_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .max(30000)
    .default(10000),
});

export class EnvironmentConfigError extends Error {
  constructor(issues) {
    super("Server environment configuration is invalid");
    this.name = "EnvironmentConfigError";
    this.issues = issues.map(({ path, message }) => ({
      field: path.join(".") || "environment",
      message,
    }));
  }
}

function parseHttpOrigin(value, field) {
  try {
    const url = new URL(value);

    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error("Origin must contain only an http(s) scheme and host");
    }

    return url.origin;
  } catch {
    throw new EnvironmentConfigError([
      {
        path: [field],
        message:
          "Must be a valid HTTP origin without a path, query, or fragment",
      },
    ]);
  }
}

function isStrongConfiguredSecret(value) {
  return value.length >= 32 && !value.toLowerCase().startsWith("replace-");
}

export function parseEnvironment(source = process.env) {
  const parsed = sourceSchema.safeParse(source);

  if (!parsed.success) {
    throw new EnvironmentConfigError(parsed.error.issues);
  }

  const values = parsed.data;
  const frontendOrigin = parseHttpOrigin(values.FRONTEND_URL, "FRONTEND_URL");
  const configuredOrigins = values.CORS_ALLOWED_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
    .map((origin) => parseHttpOrigin(origin, "CORS_ALLOWED_ORIGINS"));
  const corsOrigins = [...new Set([frontendOrigin, ...configuredOrigins])];
  const issues = [];

  if (
    values.NODE_ENV !== "test" &&
    !/^mongodb(?:\+srv)?:\/\//.test(values.MONGODB_URI)
  ) {
    issues.push({
      path: ["MONGODB_URI"],
      message:
        "Must be a MongoDB connection string outside the test environment",
    });
  }

  if (values.NODE_ENV !== "test" && values.PORT === 0) {
    issues.push({
      path: ["PORT"],
      message: "Port 0 is reserved for automated tests",
    });
  }

  if (values.NODE_ENV !== "test") {
    for (const field of [
      "JWT_ACCESS_SECRET",
      "JWT_REFRESH_SECRET",
      "IP_HASH_SECRET",
    ]) {
      if (!isStrongConfiguredSecret(values[field])) {
        issues.push({
          path: [field],
          message:
            "Must be replaced with at least 32 characters of high-entropy secret data",
        });
      }
    }

    if (
      values.JWT_ACCESS_SECRET &&
      values.JWT_REFRESH_SECRET &&
      values.JWT_ACCESS_SECRET === values.JWT_REFRESH_SECRET
    ) {
      issues.push({
        path: ["JWT_REFRESH_SECRET"],
        message: "Must be different from JWT_ACCESS_SECRET",
      });
    }
  }

  if (values.NODE_ENV === "production" && values.EMAIL_PROVIDER !== "resend") {
    issues.push({
      path: ["EMAIL_PROVIDER"],
      message: "Production requires a transactional email provider",
    });
  }

  if (
    values.NODE_ENV === "production" &&
    ["development", "test"].includes(
      values.ACCOUNT_CLOSURE_POLICY_VERSION.toLowerCase(),
    )
  ) {
    issues.push({
      path: ["ACCOUNT_CLOSURE_POLICY_VERSION"],
      message: "Production requires a published account-closure policy version",
    });
  }

  if (values.NODE_ENV === "production") {
    try {
      const closureNoticeUrl = new URL(values.ACCOUNT_CLOSURE_NOTICE_URL);
      if (
        closureNoticeUrl.protocol !== "https:" ||
        closureNoticeUrl.username ||
        closureNoticeUrl.password
      ) {
        throw new Error("Invalid account-closure notice URL");
      }
    } catch {
      issues.push({
        path: ["ACCOUNT_CLOSURE_NOTICE_URL"],
        message: "Production requires a published HTTPS account-closure notice",
      });
    }
  }

  const storageFields = [
    "STORAGE_REGION",
    "STORAGE_BUCKET",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
  ];
  const configuredStorageFields = storageFields.filter(
    (field) => Boolean(values[field]) && !values[field].startsWith("replace-"),
  );
  if (
    values.NODE_ENV === "production" ||
    (configuredStorageFields.length > 0 &&
      configuredStorageFields.length < storageFields.length)
  ) {
    for (const field of storageFields) {
      if (!values[field] || values[field].startsWith("replace-"))
        issues.push({
          path: [field],
          message: "Private object storage requires a real configured value",
        });
    }
  }
  if (values.STORAGE_ENDPOINT) {
    try {
      const endpoint = new URL(values.STORAGE_ENDPOINT);
      if (
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        !["http:", "https:"].includes(endpoint.protocol) ||
        (values.NODE_ENV === "production" && endpoint.protocol !== "https:")
      )
        throw new Error("Invalid storage endpoint");
    } catch {
      issues.push({
        path: ["STORAGE_ENDPOINT"],
        message:
          "Must be an HTTPS endpoint in production without credentials, query, or fragment",
      });
    }
  }

  if (values.IDENTITY_PROCESSING_ENABLED === "true") {
    if (configuredStorageFields.length !== storageFields.length)
      issues.push({
        path: ["STORAGE_BUCKET"],
        message: "Identity collection requires private object storage",
      });
    if (
      !/^[A-Za-z0-9._-]{1,50}$/.test(values.IDENTITY_PRIVACY_NOTICE_VERSION) ||
      (values.NODE_ENV === "production" &&
        ["development", "test"].includes(
          values.IDENTITY_PRIVACY_NOTICE_VERSION.toLowerCase(),
        ))
    )
      issues.push({
        path: ["IDENTITY_PRIVACY_NOTICE_VERSION"],
        message: "Identity collection requires a published notice version",
      });
    if (!values.IDENTITY_SCANNER_SOCKET && !values.IDENTITY_SCANNER_PORT)
      issues.push({
        path: ["IDENTITY_SCANNER_SOCKET"],
        message: "Identity collection requires a local malware scanner",
      });
    if (values.IDENTITY_SCANNER_SOCKET && values.IDENTITY_SCANNER_PORT)
      issues.push({
        path: ["IDENTITY_SCANNER_PORT"],
        message: "Choose one local scanner transport",
      });
    try {
      const noticeUrl = new URL(values.IDENTITY_PRIVACY_NOTICE_URL);
      if (
        noticeUrl.username ||
        noticeUrl.password ||
        !["http:", "https:"].includes(noticeUrl.protocol) ||
        (values.NODE_ENV === "production" && noticeUrl.protocol !== "https:")
      )
        throw new Error("Invalid identity privacy notice URL");
    } catch {
      issues.push({
        path: ["IDENTITY_PRIVACY_NOTICE_URL"],
        message:
          "Identity collection requires a published notice URL (HTTPS in production)",
      });
    }
  }

  const paymentMethodTypes = [
    ...new Set(
      values.PAYMENT_METHOD_TYPES.split(",")
        .map((type) => type.trim())
        .filter(Boolean),
    ),
  ];
  if (
    !paymentMethodTypes.length ||
    paymentMethodTypes.some((type) => !["card", "gcash", "qrph"].includes(type))
  )
    issues.push({
      path: ["PAYMENT_METHOD_TYPES"],
      message: "Choose one or more supported PayMongo checkout methods",
    });
  if (
    values.PAYMENT_ENABLED === "true" &&
    values.PAYMENT_PROVIDER !== "paymongo"
  )
    issues.push({
      path: ["PAYMENT_PROVIDER"],
      message: "Enabled platform donations require the PayMongo provider",
    });
  if (values.PAYMENT_PROVIDER === "paymongo") {
    if (values.NODE_ENV === "production" && values.PAYMENT_MODE !== "live")
      issues.push({
        path: ["PAYMENT_MODE"],
        message: "Production donations require live mode",
      });
    if (
      values.PAYMENT_MODE === "live" &&
      !frontendOrigin.startsWith("https://")
    )
      issues.push({
        path: ["FRONTEND_URL"],
        message: "Live payment return URLs require HTTPS",
      });
    const prefix = values.PAYMENT_MODE === "live" ? "sk_live_" : "sk_test_";
    if (
      !values.PAYMENT_SECRET_KEY.startsWith(prefix) ||
      values.PAYMENT_SECRET_KEY.length < prefix.length + 12
    )
      issues.push({
        path: ["PAYMENT_SECRET_KEY"],
        message: "A real PayMongo secret key matching payment mode is required",
      });
    if (
      values.PAYMENT_WEBHOOK_SECRET.length < 16 ||
      values.PAYMENT_WEBHOOK_SECRET.startsWith("replace-")
    )
      issues.push({
        path: ["PAYMENT_WEBHOOK_SECRET"],
        message: "A real endpoint-specific webhook signing secret is required",
      });
    if (
      values.PAYMENT_SECRET_KEY &&
      values.PAYMENT_SECRET_KEY === values.PAYMENT_WEBHOOK_SECRET
    )
      issues.push({
        path: ["PAYMENT_WEBHOOK_SECRET"],
        message: "Webhook and API secrets must be independent",
      });
  }

  if (values.AI_ASSISTANCE_ENABLED === "true") {
    if (!values.AI_PROVIDER)
      issues.push({
        path: ["AI_PROVIDER"],
        message: "Enabled AI assistance requires an AI provider",
      });
    if (values.AI_PROVIDER === "openai") {
      if (!/^sk-[A-Za-z0-9_-]{16,}$/.test(values.OPENAI_API_KEY))
        issues.push({
          path: ["OPENAI_API_KEY"],
          message:
            "Enabled OpenAI assistance requires a real server-side API key",
        });
      if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(values.OPENAI_MODEL))
        issues.push({
          path: ["OPENAI_MODEL"],
          message: "Enabled OpenAI assistance requires an explicit model",
        });
    }
    if (values.AI_PROVIDER === "groq") {
      if (!/^gsk_[A-Za-z0-9_-]{20,}$/.test(values.GROQ_API_KEY))
        issues.push({
          path: ["GROQ_API_KEY"],
          message:
            "Enabled Groq assistance requires a real server-side API key",
        });
      if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}$/.test(values.GROQ_MODEL))
        issues.push({
          path: ["GROQ_MODEL"],
          message: "Enabled Groq assistance requires an explicit model",
        });
    }
    if (!isStrongConfiguredSecret(values.AI_SAFETY_IDENTIFIER_SECRET))
      issues.push({
        path: ["AI_SAFETY_IDENTIFIER_SECRET"],
        message: "AI safety identifiers require a separate 32-character secret",
      });
    if (
      [
        values.JWT_ACCESS_SECRET,
        values.JWT_REFRESH_SECRET,
        values.IP_HASH_SECRET,
      ].includes(values.AI_SAFETY_IDENTIFIER_SECRET)
    )
      issues.push({
        path: ["AI_SAFETY_IDENTIFIER_SECRET"],
        message: "Must be independent from authentication and IP hash secrets",
      });
  }

  if (values.EMAIL_PROVIDER === "resend" && !values.EMAIL_API_KEY) {
    issues.push({
      path: ["EMAIL_API_KEY"],
      message: "Is required when EMAIL_PROVIDER is resend",
    });
  }

  if (
    values.NODE_ENV === "production" &&
    corsOrigins.some((origin) => !origin.startsWith("https://"))
  ) {
    issues.push({
      path: ["CORS_ALLOWED_ORIGINS"],
      message: "Production origins must use HTTPS",
    });
  }

  if (issues.length > 0) {
    throw new EnvironmentConfigError(issues);
  }

  return Object.freeze({
    environment: values.NODE_ENV,
    port: values.PORT,
    logLevel: values.LOG_LEVEL,
    mongoUri: values.MONGODB_URI,
    mongoServerSelectionTimeoutMs: values.MONGODB_SERVER_SELECTION_TIMEOUT_MS,
    frontendOrigin,
    corsOrigins: Object.freeze(corsOrigins),
    mobileScheme: values.MOBILE_SCHEME,
    trustProxy: values.TRUST_PROXY,
    jsonBodyLimit: values.JSON_BODY_LIMIT,
    rateLimitWindowMs: values.RATE_LIMIT_WINDOW_MS,
    rateLimitMax: values.RATE_LIMIT_MAX,
    authRateLimitWindowMs: values.AUTH_RATE_LIMIT_WINDOW_MS,
    authRateLimitMax: values.AUTH_RATE_LIMIT_MAX,
    emailActionRateLimitMax: values.EMAIL_ACTION_RATE_LIMIT_MAX,
    shutdownTimeoutMs: values.SHUTDOWN_TIMEOUT_MS,
    jwtAccessSecret: values.JWT_ACCESS_SECRET,
    jwtRefreshSecret: values.JWT_REFRESH_SECRET,
    accessTokenTtlMinutes: values.ACCESS_TOKEN_TTL_MINUTES,
    refreshTokenTtlDays: values.REFRESH_TOKEN_TTL_DAYS,
    passwordHashRounds: values.PASSWORD_HASH_ROUNDS,
    ipHashSecret: values.IP_HASH_SECRET,
    emailProvider: values.EMAIL_PROVIDER,
    emailFrom: values.EMAIL_FROM,
    emailApiKey: values.EMAIL_API_KEY,
    emailVerificationTtlMinutes: values.EMAIL_VERIFICATION_TTL_MINUTES,
    passwordResetTtlMinutes: values.PASSWORD_RESET_TTL_MINUTES,
    refreshCookieName: values.REFRESH_COOKIE_NAME,
    termsVersion: values.TERMS_VERSION,
    privacyVersion: values.PRIVACY_VERSION,
    accountClosurePolicyVersion: values.ACCOUNT_CLOSURE_POLICY_VERSION,
    accountClosureNoticeUrl: values.ACCOUNT_CLOSURE_NOTICE_URL,
    maxRequestEstimatedValueCentavos:
      values.MAX_REQUEST_ESTIMATED_VALUE_CENTAVOS,
    maxRequestNeedItems: values.MAX_REQUEST_NEED_ITEMS,
    offerRateLimitWindowMs: values.OFFER_RATE_LIMIT_WINDOW_MS,
    offerRateLimitMax: values.OFFER_RATE_LIMIT_MAX,
    messageRateLimitWindowMs: values.MESSAGE_RATE_LIMIT_WINDOW_MS,
    messageRateLimitMax: values.MESSAGE_RATE_LIMIT_MAX,
    evidenceUploadRateLimitWindowMs:
      values.EVIDENCE_UPLOAD_RATE_LIMIT_WINDOW_MS,
    evidenceUploadRateLimitMax: values.EVIDENCE_UPLOAD_RATE_LIMIT_MAX,
    idempotencyTtlHours: values.IDEMPOTENCY_TTL_HOURS,
    storageEndpoint: values.STORAGE_ENDPOINT,
    storageRegion: values.STORAGE_REGION,
    storageBucket: values.STORAGE_BUCKET,
    storageAccessKeyId: values.STORAGE_ACCESS_KEY_ID.startsWith("replace-")
      ? ""
      : values.STORAGE_ACCESS_KEY_ID,
    storageSecretAccessKey: values.STORAGE_SECRET_ACCESS_KEY.startsWith(
      "replace-",
    )
      ? ""
      : values.STORAGE_SECRET_ACCESS_KEY,
    identityProcessingEnabled: values.IDENTITY_PROCESSING_ENABLED === "true",
    identityPrivacyNoticeVersion: values.IDENTITY_PRIVACY_NOTICE_VERSION,
    identityPrivacyNoticeUrl: values.IDENTITY_PRIVACY_NOTICE_URL,
    identityScannerSocket: values.IDENTITY_SCANNER_SOCKET,
    identityScannerPort: values.IDENTITY_SCANNER_PORT,
    paymentEnabled: values.PAYMENT_ENABLED === "true",
    paymentProvider: values.PAYMENT_PROVIDER,
    paymentMode: values.PAYMENT_MODE,
    paymentSecretKey: values.PAYMENT_SECRET_KEY.startsWith("replace-")
      ? ""
      : values.PAYMENT_SECRET_KEY,
    paymentWebhookSecret: values.PAYMENT_WEBHOOK_SECRET.startsWith("replace-")
      ? ""
      : values.PAYMENT_WEBHOOK_SECRET,
    paymentMethodTypes: Object.freeze(paymentMethodTypes),
    aiAssistanceEnabled: values.AI_ASSISTANCE_ENABLED === "true",
    aiProvider: values.AI_PROVIDER,
    openAiApiKey: values.OPENAI_API_KEY.startsWith("replace-")
      ? ""
      : values.OPENAI_API_KEY,
    openAiModel: values.OPENAI_MODEL,
    groqApiKey: values.GROQ_API_KEY.startsWith("replace-")
      ? ""
      : values.GROQ_API_KEY,
    groqModel: values.GROQ_MODEL,
    aiSafetyIdentifierSecret: values.AI_SAFETY_IDENTIFIER_SECRET.startsWith(
      "replace-",
    )
      ? ""
      : values.AI_SAFETY_IDENTIFIER_SECRET,
    aiRequestRateLimitWindowMs: values.AI_REQUEST_RATE_LIMIT_WINDOW_MS,
    aiRequestRateLimitMax: values.AI_REQUEST_RATE_LIMIT_MAX,
    aiProviderTimeoutMs: values.AI_PROVIDER_TIMEOUT_MS,
  });
}
