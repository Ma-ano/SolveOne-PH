import { describe, expect, it } from "vitest";

import { EnvironmentConfigError, parseEnvironment } from "../src/config/env.js";

describe("parseEnvironment", () => {
  const strongSecrets = {
    JWT_ACCESS_SECRET: "development-access-secret-with-32-characters",
    JWT_REFRESH_SECRET: "development-refresh-secret-with-32-characters",
    IP_HASH_SECRET: "development-ip-hash-secret-with-32-characters",
  };

  it("creates normalized immutable test configuration", () => {
    const config = parseEnvironment({
      NODE_ENV: "test",
      FRONTEND_URL: "http://localhost:8081/",
      CORS_ALLOWED_ORIGINS: "http://localhost:3000,http://localhost:8081",
    });

    expect(config.environment).toBe("test");
    expect(config.port).toBe(5000);
    expect(config.messageRateLimitWindowMs).toBe(60000);
    expect(config.messageRateLimitMax).toBe(60);
    expect(config.aiAssistanceEnabled).toBe(false);
    expect(config.aiProvider).toBe("");
    expect(config.aiRequestRateLimitMax).toBe(5);
    expect(config.accountClosurePolicyVersion).toBe("development");
    expect(config.accountClosureNoticeUrl).toBe("");
    expect(config.frontendOrigin).toBe("http://localhost:8081");
    expect(config.corsOrigins).toEqual([
      "http://localhost:8081",
      "http://localhost:3000",
    ]);
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.corsOrigins)).toBe(true);
  });

  it("requires MongoDB outside the test environment", () => {
    expect(() => parseEnvironment({ NODE_ENV: "development" })).toThrow(
      EnvironmentConfigError,
    );
  });

  it("accepts independent strong authentication secrets in development", () => {
    const config = parseEnvironment({
      NODE_ENV: "development",
      MONGODB_URI: "mongodb://localhost:27017/solveone",
      ...strongSecrets,
    });

    expect(config.jwtAccessSecret).toBe(strongSecrets.JWT_ACCESS_SECRET);
    expect(config.jwtRefreshSecret).toBe(strongSecrets.JWT_REFRESH_SECRET);
  });

  it("rejects placeholder, short, or shared authentication secrets", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "development",
        MONGODB_URI: "mongodb://localhost:27017/solveone",
        JWT_ACCESS_SECRET: "replace-with-an-access-secret-over-32-chars",
        JWT_REFRESH_SECRET: "same-secret-value-that-is-long-enough-1234",
        IP_HASH_SECRET: "short",
      }),
    ).toThrow(EnvironmentConfigError);

    expect(() =>
      parseEnvironment({
        NODE_ENV: "development",
        MONGODB_URI: "mongodb://localhost:27017/solveone",
        JWT_ACCESS_SECRET: "same-secret-value-that-is-long-enough-1234",
        JWT_REFRESH_SECRET: "same-secret-value-that-is-long-enough-1234",
        IP_HASH_SECRET: strongSecrets.IP_HASH_SECRET,
      }),
    ).toThrow(EnvironmentConfigError);
  });

  it("reserves port zero for automated tests", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "development",
        PORT: "0",
        MONGODB_URI: "mongodb://localhost:27017/solveone",
      }),
    ).toThrow(EnvironmentConfigError);
  });

  it("rejects invalid origin paths", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "test",
        FRONTEND_URL: "https://solveone.example/private",
      }),
    ).toThrow(EnvironmentConfigError);
  });

  it("rejects credentials embedded in an origin", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "test",
        FRONTEND_URL: "https://user:secret@solveone.example",
      }),
    ).toThrow(EnvironmentConfigError);
  });

  it("requires HTTPS origins in production", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        MONGODB_URI: "mongodb+srv://example.invalid/solveone",
        FRONTEND_URL: "http://solveone.example",
      }),
    ).toThrow(EnvironmentConfigError);
  });

  it("keeps payments disabled by default and validates every enabled provider secret", () => {
    const disabled = parseEnvironment({ NODE_ENV: "test" });
    expect(disabled.paymentEnabled).toBe(false);
    expect(disabled.paymentProvider).toBe("");
    expect(disabled.paymentMode).toBe("test");

    expect(() =>
      parseEnvironment({
        NODE_ENV: "test",
        PAYMENT_ENABLED: "true",
        PAYMENT_PROVIDER: "paymongo",
        PAYMENT_MODE: "test",
      }),
    ).toThrow(EnvironmentConfigError);

    const enabled = parseEnvironment({
      NODE_ENV: "test",
      PAYMENT_ENABLED: "true",
      PAYMENT_PROVIDER: "paymongo",
      PAYMENT_MODE: "test",
      PAYMENT_SECRET_KEY: "sk_test_example-secret-key-value",
      PAYMENT_WEBHOOK_SECRET: "endpoint-specific-secret-value",
      PAYMENT_METHOD_TYPES: "card,gcash,card",
    });
    expect(enabled.paymentEnabled).toBe(true);
    expect(enabled.paymentMethodTypes).toEqual(["card", "gcash"]);
    expect(Object.isFrozen(enabled.paymentMethodTypes)).toBe(true);

    expect(() =>
      parseEnvironment({
        NODE_ENV: "test",
        FRONTEND_URL: "https://solveone.example",
        PAYMENT_PROVIDER: "paymongo",
        PAYMENT_MODE: "live",
        PAYMENT_SECRET_KEY: "sk_live_shared-secret-value",
        PAYMENT_WEBHOOK_SECRET: "sk_live_shared-secret-value",
      }),
    ).toThrow(EnvironmentConfigError);

    expect(() =>
      parseEnvironment({
        NODE_ENV: "test",
        FRONTEND_URL: "http://localhost:8081",
        PAYMENT_PROVIDER: "paymongo",
        PAYMENT_MODE: "live",
        PAYMENT_SECRET_KEY: "sk_live_example-secret-key-value",
        PAYMENT_WEBHOOK_SECRET: "independent-webhook-secret-value",
      }),
    ).toThrow(EnvironmentConfigError);
  });

  it("does not allow test-mode payments in production", () => {
    expect(() =>
      parseEnvironment({
        NODE_ENV: "production",
        MONGODB_URI: "mongodb+srv://example.invalid/solveone",
        FRONTEND_URL: "https://solveone.example",
        EMAIL_PROVIDER: "resend",
        EMAIL_API_KEY: "test-provider-key",
        STORAGE_ENDPOINT: "https://storage.solveone.example",
        STORAGE_REGION: "ap-southeast-1",
        STORAGE_BUCKET: "private-evidence",
        STORAGE_ACCESS_KEY_ID: "test-access-id",
        STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
        PAYMENT_ENABLED: "true",
        PAYMENT_PROVIDER: "paymongo",
        PAYMENT_MODE: "test",
        PAYMENT_SECRET_KEY: "sk_test_example-secret-key-value",
        PAYMENT_WEBHOOK_SECRET: "endpoint-specific-secret-value",
        ...strongSecrets,
      }),
    ).toThrow(EnvironmentConfigError);
  });

  it("keeps AI optional and validates every enabled provider setting", () => {
    expect(parseEnvironment({ NODE_ENV: "test" }).aiAssistanceEnabled).toBe(
      false,
    );
    expect(() =>
      parseEnvironment({ NODE_ENV: "test", AI_ASSISTANCE_ENABLED: "true" }),
    ).toThrow(EnvironmentConfigError);

    const config = parseEnvironment({
      NODE_ENV: "test",
      AI_ASSISTANCE_ENABLED: "true",
      AI_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-key-with-enough-characters",
      OPENAI_MODEL: "configured-structured-output-model",
      AI_SAFETY_IDENTIFIER_SECRET:
        "independent-ai-safety-secret-with-32-characters",
    });
    expect(config.aiAssistanceEnabled).toBe(true);
    expect(config.aiProvider).toBe("openai");
    expect(config.openAiModel).toBe("configured-structured-output-model");
  });

  it("requires private S3-compatible storage in production", () => {
    const base = {
      NODE_ENV: "production",
      MONGODB_URI: "mongodb+srv://example.invalid/solveone",
      FRONTEND_URL: "https://solveone.example",
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "test-provider-key",
      ACCOUNT_CLOSURE_POLICY_VERSION: "2026-09-18",
      ACCOUNT_CLOSURE_NOTICE_URL:
        "https://solveone.example/privacy/account-closure",
      ...strongSecrets,
    };
    expect(() => parseEnvironment(base)).toThrow(EnvironmentConfigError);
    const config = parseEnvironment({
      ...base,
      STORAGE_ENDPOINT: "https://storage.solveone.example",
      STORAGE_REGION: "ap-southeast-1",
      STORAGE_BUCKET: "private-evidence",
      STORAGE_ACCESS_KEY_ID: "test-access-id",
      STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
    });
    expect(config.storageBucket).toBe("private-evidence");
    expect(() =>
      parseEnvironment({
        ...base,
        STORAGE_ENDPOINT: "http://storage.solveone.example",
        STORAGE_REGION: "ap-southeast-1",
        STORAGE_BUCKET: "private-evidence",
        STORAGE_ACCESS_KEY_ID: "test-access-id",
        STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
      }),
    ).toThrow(EnvironmentConfigError);
  });

  it("requires a published account-closure notice in production", () => {
    const production = {
      NODE_ENV: "production",
      MONGODB_URI: "mongodb+srv://example.invalid/solveone",
      FRONTEND_URL: "https://solveone.example",
      EMAIL_PROVIDER: "resend",
      EMAIL_API_KEY: "test-provider-key",
      STORAGE_ENDPOINT: "https://storage.solveone.example",
      STORAGE_REGION: "ap-southeast-1",
      STORAGE_BUCKET: "private-evidence",
      STORAGE_ACCESS_KEY_ID: "test-access-id",
      STORAGE_SECRET_ACCESS_KEY: "test-secret-key",
      ...strongSecrets,
    };

    expect(() => parseEnvironment(production)).toThrow(EnvironmentConfigError);
    expect(() =>
      parseEnvironment({
        ...production,
        ACCOUNT_CLOSURE_POLICY_VERSION: "2026-09-18",
        ACCOUNT_CLOSURE_NOTICE_URL: "http://solveone.example/closure",
      }),
    ).toThrow(EnvironmentConfigError);

    const config = parseEnvironment({
      ...production,
      ACCOUNT_CLOSURE_POLICY_VERSION: "2026-09-18",
      ACCOUNT_CLOSURE_NOTICE_URL:
        "https://solveone.example/privacy/account-closure",
    });
    expect(config.accountClosurePolicyVersion).toBe("2026-09-18");
  });
});
