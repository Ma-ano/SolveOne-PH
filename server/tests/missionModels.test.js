import { describe, expect, it, vi } from "vitest";

import { createMissionIndexes } from "../src/jobs/createMissionIndexes.js";
import { CommunityMission } from "../src/models/CommunityMission.js";
import { MissionContribution } from "../src/models/MissionContribution.js";

describe("community mission persistence models", () => {
  it("bounds resources and keeps verification evidence private", () => {
    expect(CommunityMission.schema.path("requiredResources")).toBeTruthy();
    expect(CommunityMission.schema.path("evidence.note").options.select).toBe(
      false,
    );
    expect(
      CommunityMission.schema.path("requiredResources.quantity").options,
    ).toMatchObject({ min: 1, max: 1000 });
    expect(CommunityMission.schema.path("location.barangay")).toBeTruthy();
  });

  it("indexes discovery, moderation, participants, and active contributions", () => {
    const missionNames = CommunityMission.schema
      .indexes()
      .map(([, options]) => options.name);
    expect(missionNames).toEqual(
      expect.arrayContaining([
        "mission_public_listing",
        "mission_creator_updated",
        "mission_moderation_queue",
        "mission_volunteer_matching",
      ]),
    );
    const activeIndex = MissionContribution.schema
      .indexes()
      .find(
        ([, options]) => options.name === "mission_contribution_active_unique",
      )[1];
    expect(activeIndex).toMatchObject({
      unique: true,
      partialFilterExpression: { activeKey: { $type: "string" } },
    });
  });

  it("has an operator-run, create-only index step", async () => {
    const missionModel = {
      createIndexes: vi.fn(async () => ["mission_public_listing"]),
    };
    const contributionModel = {
      createIndexes: vi.fn(async () => ["mission_contribution_active_unique"]),
    };
    await expect(
      createMissionIndexes(missionModel, contributionModel),
    ).resolves.toEqual({
      missionIndexes: ["mission_public_listing"],
      contributionIndexes: ["mission_contribution_active_unique"],
    });
    expect(missionModel.createIndexes).toHaveBeenCalledOnce();
    expect(contributionModel.createIndexes).toHaveBeenCalledOnce();
  });
});
