import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "../src/config/logger.js";

describe("structured logger", () => {
  it("redacts common credentials and authentication headers", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger({
      level: "info",
      environment: "test",
      destination,
    });

    logger.info({
      password: "not-for-logs",
      accessToken: "access-secret",
      mongoUri: "mongodb+srv://database-secret",
      req: {
        headers: {
          authorization: "Bearer auth-secret",
          cookie: "refreshToken=cookie-secret",
        },
      },
    });

    expect(output).toContain("[REDACTED]");
    expect(output).not.toContain("not-for-logs");
    expect(output).not.toContain("access-secret");
    expect(output).not.toContain("database-secret");
    expect(output).not.toContain("auth-secret");
    expect(output).not.toContain("cookie-secret");
  });
});
