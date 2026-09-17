import { describe, expect, it } from "vitest";
import request from "supertest";

import {
  createAuthFixture,
  registerAndVerify,
  validRegistration,
} from "./helpers/createAuthFixture.js";

const loginContext = {
  deviceName: "Profile test device",
  platform: "android",
};

async function authenticatedFixture() {
  const fixture = createAuthFixture();
  const user = await registerAndVerify(fixture);
  const session = await fixture.authService.login(
    {
      email: validRegistration.email,
      password: validRegistration.password,
      ...loginContext,
    },
    { ipAddress: "203.0.113.12" },
  );

  return { ...fixture, session, user };
}

describe("profile API", () => {
  it("requires authentication for the private profile", async () => {
    const fixture = createAuthFixture();
    const response = await request(fixture.app).get("/api/v1/users/me");

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("AUTH_REQUIRED");
  });

  it("lets the owner read and update allowlisted private fields", async () => {
    const fixture = await authenticatedFixture();
    const update = await request(fixture.app)
      .patch("/api/v1/users/me")
      .set("Authorization", `Bearer ${fixture.session.accessToken}`)
      .send({
        firstName: "Mia",
        lastName: "Santos-Reyes",
        bio: "I help with online forms and document formatting.",
        skills: ["Digital assistance", "Document formatting"],
        location: {
          country: "Philippines",
          province: "Cebu",
          city: "Cebu City",
          barangay: "Lahug",
        },
      });

    expect(update.status).toBe(200);
    expect(update.body.data.user).toMatchObject({
      firstName: "Mia",
      email: "maria.santos@example.com",
      skills: ["Digital assistance", "Document formatting"],
      location: { barangay: "Lahug" },
    });

    const profile = await request(fixture.app)
      .get("/api/v1/users/me")
      .set("Authorization", `Bearer ${fixture.session.accessToken}`);
    expect(profile.status).toBe(200);
    expect(profile.body.data.user.firstName).toBe("Mia");
  });

  it("rejects protected fields, duplicate skills, and non-owner update routes", async () => {
    const fixture = await authenticatedFixture();
    const authorization = `Bearer ${fixture.session.accessToken}`;

    const protectedField = await request(fixture.app)
      .patch("/api/v1/users/me")
      .set("Authorization", authorization)
      .send({ role: "admin" });
    expect(protectedField.status).toBe(422);

    const duplicateSkills = await request(fixture.app)
      .patch("/api/v1/users/me")
      .set("Authorization", authorization)
      .send({ skills: ["Tutoring", "tutoring"] });
    expect(duplicateSkills.status).toBe(422);

    const arbitraryOwner = await request(fixture.app)
      .patch(`/api/v1/users/${fixture.user.id}`)
      .set("Authorization", authorization)
      .send({ bio: "Not an exposed operation" });
    expect(arbitraryOwner.status).toBe(404);
  });

  it("serves a privacy-safe public profile without authentication", async () => {
    const fixture = await authenticatedFixture();
    await fixture.userService.updatePrivateProfile(fixture.user.id, {
      bio: "Volunteer tutor",
      skills: ["Math tutoring"],
      location: {
        country: "Philippines",
        province: "Cebu",
        city: "Cebu City",
        barangay: "Lahug",
      },
    });

    const response = await request(fixture.app).get(
      `/api/v1/users/${fixture.user.id}`,
    );

    expect(response.status).toBe(200);
    expect(response.body.data.user).toMatchObject({
      displayName: "Maria S.",
      bio: "Volunteer tutor",
      skills: ["Math tutoring"],
      location: { city: "Cebu City" },
    });
    expect(response.body.data.user.location).not.toHaveProperty("barangay");
    expect(response.body.data.user).not.toHaveProperty("email");
    expect(response.body.data.user).not.toHaveProperty("role");
    expect(response.body.data.user).not.toHaveProperty("accountStatus");
    expect(response.body.data.user).not.toHaveProperty("firstName");
    expect(response.body.data.user).not.toHaveProperty("lastName");
  });

  it("validates public IDs and conceals unavailable accounts", async () => {
    const fixture = await authenticatedFixture();
    const invalid = await request(fixture.app).get("/api/v1/users/not-an-id");
    expect(invalid.status).toBe(422);

    fixture.repository.users.get(fixture.user.id).accountStatus = "disabled";
    const hidden = await request(fixture.app).get(
      `/api/v1/users/${fixture.user.id}`,
    );
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe("USER_NOT_FOUND");
  });
});
