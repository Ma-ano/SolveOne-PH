import { describe, expect, it } from "vitest";
import request from "supertest";

import {
  createAuthFixture,
  registerAndVerify,
  validRegistration,
} from "./helpers/createAuthFixture.js";

describe("authentication API", () => {
  it("rejects unknown registration fields instead of accepting role escalation", async () => {
    const { app } = createAuthFixture();
    const response = await request(app)
      .post("/api/v1/auth/register")
      .send({ ...validRegistration, role: "admin" });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects object-shaped email input before it reaches MongoDB", async () => {
    const { app } = createAuthFixture();
    const response = await request(app)
      .post("/api/v1/auth/login")
      .send({
        email: { $ne: null },
        password: validRegistration.password,
        platform: "web",
        deviceName: "Browser",
      });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("supports registration and one-time email verification", async () => {
    const fixture = createAuthFixture();
    const registration = await request(fixture.app)
      .post("/api/v1/auth/register")
      .send(validRegistration);

    expect(registration.status).toBe(201);
    expect(registration.body.data.user).not.toHaveProperty("passwordHash");
    expect(registration.body.data.user.role).toBe("user");

    const token = fixture.sentEmails.verification[0].token;
    const verified = await request(fixture.app)
      .post("/api/v1/auth/verify-email")
      .send({ token });
    expect(verified.status).toBe(200);
    expect(verified.body.data.user.emailVerified).toBe(true);

    const replay = await request(fixture.app)
      .post("/api/v1/auth/verify-email")
      .send({ token });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("EMAIL_VERIFICATION_TOKEN_INVALID");
  });

  it("keeps browser refresh tokens in HttpOnly cookies even if the platform is forged", async () => {
    const fixture = createAuthFixture();
    await registerAndVerify(fixture);

    const login = await request(fixture.app)
      .post("/api/v1/auth/login")
      .set("Origin", "http://localhost:8081")
      .send({
        email: validRegistration.email,
        password: validRegistration.password,
        deviceName: "Browser",
        platform: "android",
      });

    expect(login.status).toBe(200);
    expect(login.body.data).not.toHaveProperty("refreshToken");
    expect(login.headers["set-cookie"][0]).toContain("solveone_refresh=");
    expect(login.headers["set-cookie"][0]).toContain("HttpOnly");

    const cookie = login.headers["set-cookie"][0].split(";")[0];
    const refreshed = await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", cookie)
      .send({ platform: "unknown", deviceName: "Browser" });

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data).not.toHaveProperty("refreshToken");
    expect(refreshed.headers["set-cookie"][0]).toContain("HttpOnly");
  });

  it("returns rotating refresh tokens to native clients and protects logout-all", async () => {
    const fixture = createAuthFixture();
    await registerAndVerify(fixture);
    const login = await request(fixture.app).post("/api/v1/auth/login").send({
      email: validRegistration.email,
      password: validRegistration.password,
      deviceName: "Pixel test device",
      platform: "android",
    });

    expect(login.status).toBe(200);
    expect(login.body.data.refreshToken).toEqual(expect.any(String));

    const anonymous = await request(fixture.app)
      .post("/api/v1/auth/logout-all")
      .send({});
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error.code).toBe("AUTH_REQUIRED");

    const logoutAll = await request(fixture.app)
      .post("/api/v1/auth/logout-all")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({});
    expect(logoutAll.status).toBe(200);

    const afterLogout = await request(fixture.app)
      .post("/api/v1/auth/logout-all")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({});
    expect(afterLogout.status).toBe(401);
  });

  it("clears a rejected browser refresh cookie", async () => {
    const fixture = createAuthFixture();
    const response = await request(fixture.app)
      .post("/api/v1/auth/refresh")
      .set("Cookie", `solveone_refresh=${"x".repeat(40)}`)
      .send({ platform: "web", deviceName: "Browser" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("REFRESH_TOKEN_INVALID");
    expect(response.headers["set-cookie"][0]).toContain("solveone_refresh=;");
    expect(response.headers["set-cookie"][0]).toContain(
      "Expires=Thu, 01 Jan 1970",
    );
  });

  it("uses the same forgot-password response for known and unknown accounts", async () => {
    const fixture = createAuthFixture();
    await registerAndVerify(fixture);

    const known = await request(fixture.app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: validRegistration.email });
    const unknown = await request(fixture.app)
      .post("/api/v1/auth/forgot-password")
      .send({ email: "nobody@example.com" });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
  });

  it("applies the narrower authentication rate limit", async () => {
    const fixture = createAuthFixture({ authRateLimitMax: 1 });
    const input = {
      email: "nobody@example.com",
      password: "wrong-password",
      platform: "web",
      deviceName: "Browser",
    };

    const first = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send(input);
    const limited = await request(fixture.app)
      .post("/api/v1/auth/login")
      .send(input);

    expect(first.status).toBe(401);
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe("RATE_LIMITED");
  });

  it("exposes closure requirements and closes an eligible account", async () => {
    const fixture = createAuthFixture();
    await registerAndVerify(fixture);
    const login = await request(fixture.app).post("/api/v1/auth/login").send({
      email: validRegistration.email,
      password: validRegistration.password,
      deviceName: "Browser",
      platform: "web",
    });
    const authorization = `Bearer ${login.body.data.accessToken}`;
    const cookie = login.headers["set-cookie"][0].split(";")[0];

    const requirements = await request(fixture.app)
      .get("/api/v1/auth/account-closure")
      .set("Authorization", authorization);
    expect(requirements.status).toBe(200);
    expect(requirements.body.data).toMatchObject({
      eligible: true,
      blockers: [],
      policyVersion: "2026-09-18",
    });

    const invalid = await request(fixture.app)
      .post("/api/v1/auth/account-closure")
      .set("Authorization", authorization)
      .send({
        password: validRegistration.password,
        confirmation: "close",
        retentionAcknowledged: true,
        policyVersion: "2026-09-18",
      });
    expect(invalid.status).toBe(422);

    const closed = await request(fixture.app)
      .post("/api/v1/auth/account-closure")
      .set("Authorization", authorization)
      .set("Cookie", cookie)
      .send({
        password: validRegistration.password,
        confirmation: "CLOSE MY ACCOUNT",
        retentionAcknowledged: true,
        policyVersion: "2026-09-18",
      });
    expect(closed.status).toBe(200);
    expect(closed.body.data.message).toBe("Account closed");
    expect(closed.headers["set-cookie"][0]).toContain("solveone_refresh=;");

    const afterClosure = await request(fixture.app)
      .get("/api/v1/auth/account-closure")
      .set("Authorization", authorization);
    expect(afterClosure.status).toBe(401);
  });

  it("returns actionable blocker codes without changing the account", async () => {
    const fixture = createAuthFixture();
    await registerAndVerify(fixture);
    const login = await request(fixture.app).post("/api/v1/auth/login").send({
      email: validRegistration.email,
      password: validRegistration.password,
      deviceName: "Phone",
      platform: "android",
    });
    fixture.repository.accountClosureBlockers = ["help_requests"];

    const response = await request(fixture.app)
      .post("/api/v1/auth/account-closure")
      .set("Authorization", `Bearer ${login.body.data.accessToken}`)
      .send({
        password: validRegistration.password,
        confirmation: "CLOSE MY ACCOUNT",
        retentionAcknowledged: true,
        policyVersion: "2026-09-18",
      });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatchObject({
      code: "ACCOUNT_CLOSURE_BLOCKED",
      details: { blockers: ["help_requests"] },
    });
    expect([...fixture.repository.users.values()][0].accountStatus).toBe(
      "active",
    );
  });
});
