import { describe, expect, it } from "vitest";

import {
  createAuthFixture,
  registerAndVerify,
} from "./helpers/createAuthFixture.js";

describe("UserService", () => {
  it("updates only allowlisted profile fields and normalizes duplicate skills", async () => {
    const fixture = createAuthFixture();
    const registered = await registerAndVerify(fixture);

    const result = await fixture.userService.updatePrivateProfile(
      registered.id,
      {
        firstName: "Mia",
        bio: "I can help with practical digital tasks.",
        skills: ["Web support", "web SUPPORT", "Resume review"],
        location: {
          country: "Philippines",
          province: "Cebu",
          city: "Cebu City",
          barangay: "Lahug",
        },
        role: "admin",
        accountStatus: "suspended",
        verification: { level: "PARTNER_VERIFIED" },
        impact: { problemsSolved: 999 },
      },
    );
    const stored = fixture.repository.users.get(registered.id);

    expect(result.user).toMatchObject({
      firstName: "Mia",
      role: "user",
      accountStatus: "active",
      skills: ["Web support", "Resume review"],
      location: { barangay: "Lahug" },
      verificationLevel: "EMAIL_VERIFIED",
    });
    expect(stored).not.toHaveProperty("impact");
  });

  it("returns a public DTO without private account or precise location fields", async () => {
    const fixture = createAuthFixture();
    const registered = await registerAndVerify(fixture);
    await fixture.userService.updatePrivateProfile(registered.id, {
      bio: "Community volunteer",
      skills: ["Tutoring"],
      location: {
        country: "Philippines",
        province: "Cebu",
        city: "Cebu City",
        barangay: "Lahug",
      },
    });

    const result = await fixture.userService.getPublicProfile(registered.id);

    expect(result.user).toMatchObject({
      id: registered.id,
      displayName: "Maria S.",
      bio: "Community volunteer",
      skills: ["Tutoring"],
      location: {
        country: "Philippines",
        province: "Cebu",
        city: "Cebu City",
      },
      verificationLevel: "EMAIL_VERIFIED",
    });
    expect(result.user.location).not.toHaveProperty("barangay");
    expect(result.user).not.toHaveProperty("email");
    expect(result.user).not.toHaveProperty("role");
    expect(result.user).not.toHaveProperty("accountStatus");
    expect(result.user).not.toHaveProperty("agreements");
    expect(result.user).not.toHaveProperty("updatedAt");
    expect(result.user).not.toHaveProperty("firstName");
    expect(result.user).not.toHaveProperty("lastName");
  });

  it("conceals suspended and disabled profiles", async () => {
    const fixture = createAuthFixture();
    const registered = await registerAndVerify(fixture);
    const stored = fixture.repository.users.get(registered.id);
    stored.accountStatus = "suspended";

    await expect(
      fixture.userService.getPublicProfile(registered.id),
    ).rejects.toMatchObject({ statusCode: 404, code: "USER_NOT_FOUND" });
    await expect(
      fixture.userService.updatePrivateProfile(registered.id, {
        bio: "Should not update",
      }),
    ).rejects.toMatchObject({ statusCode: 404, code: "USER_NOT_FOUND" });
  });
});
