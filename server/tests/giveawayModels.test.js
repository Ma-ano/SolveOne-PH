import { describe, expect, it, vi } from "vitest";

import { createGiveawayIndexes } from "../src/jobs/createGiveawayIndexes.js";
import { GiveawayItem } from "../src/models/GiveawayItem.js";
import { GiveawayReservation } from "../src/models/GiveawayReservation.js";

describe("giveaway persistence models", () => {
  it("bounds free inventory and keeps photo storage metadata private", () => {
    expect(GiveawayItem.schema.path("quantity").options).toMatchObject({
      min: 1,
      max: 100,
    });
    expect(GiveawayItem.schema.path("photos").options.select).toBe(false);
    expect(GiveawayItem.schema.path("photos.storageKey").options.select).toBe(
      false,
    );
    expect(GiveawayItem.schema.path("location.barangay")).toBeTruthy();
  });

  it("indexes public inventory, owner lists, and one active relationship", () => {
    const itemNames = GiveawayItem.schema
      .indexes()
      .map(([, options]) => options.name);
    expect(itemNames).toEqual(
      expect.arrayContaining([
        "giveaway_public_category",
        "giveaway_public_province",
        "giveaway_owner_created",
      ]),
    );
    const reservationIndexes = GiveawayReservation.schema.indexes();
    expect(
      reservationIndexes.find(
        ([, options]) => options.name === "giveaway_reservation_active_unique",
      )[1],
    ).toMatchObject({
      unique: true,
      partialFilterExpression: { activeKey: { $type: "string" } },
    });
  });

  it("has an operator-run, create-only index step", async () => {
    const itemModel = {
      createIndexes: vi.fn(async () => ["giveaway_public_category"]),
    };
    const reservationModel = {
      createIndexes: vi.fn(async () => ["giveaway_reservation_active_unique"]),
    };
    await expect(
      createGiveawayIndexes(itemModel, reservationModel),
    ).resolves.toEqual({
      itemIndexes: ["giveaway_public_category"],
      reservationIndexes: ["giveaway_reservation_active_unique"],
    });
    expect(itemModel.createIndexes).toHaveBeenCalledOnce();
    expect(reservationModel.createIndexes).toHaveBeenCalledOnce();
  });
});
