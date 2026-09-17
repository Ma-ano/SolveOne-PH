import { describe, expect, it } from "vitest";

import {
  ACCOUNT_STATUSES,
  AUTH_TOKEN_TYPES,
  COMMUNITY_MISSION_STATUSES,
  DONATION_CHECKOUT_STATES,
  GIVEAWAY_ITEM_CONDITIONS,
  GIVEAWAY_ITEM_STATUSES,
  GIVEAWAY_RESERVATION_STATUSES,
  HELP_OFFER_STATUSES,
  HELP_REQUEST_STATUSES,
  HELP_TYPES,
  MESSAGE_TYPES,
  MISSION_CONTRIBUTION_STATUSES,
  MISSION_RESOURCE_TYPES,
  MISSION_VERIFICATION_STATUSES,
  NOTIFICATION_KINDS,
  NOTIFICATION_RESOURCE_TYPES,
  PLATFORM_DONATION_STATUSES,
  REPORT_STATUSES,
  REQUEST_MODERATION_ACTIONS,
  REQUEST_SAFETY_FLAGS,
  REQUEST_URGENCIES,
  REQUEST_VISIBILITIES,
  SECURITY_EVENT_TYPES,
  SESSION_PLATFORMS,
  USER_ROLES,
  VERIFICATION_LEVELS,
  VERIFICATION_RECORD_STATUSES,
  CONVERSATION_STATUSES,
  MESSAGE_REPORT_REASONS,
  MESSAGE_SAFETY_FLAGS,
  REPORT_TARGET_TYPES,
  REQUEST_REPORT_REASONS,
  USER_REPORT_REASONS,
} from "../src/constants/statuses.js";

const enumDefinitions = {
  ACCOUNT_STATUSES,
  AUTH_TOKEN_TYPES,
  COMMUNITY_MISSION_STATUSES,
  DONATION_CHECKOUT_STATES,
  GIVEAWAY_ITEM_CONDITIONS,
  GIVEAWAY_ITEM_STATUSES,
  GIVEAWAY_RESERVATION_STATUSES,
  HELP_OFFER_STATUSES,
  HELP_REQUEST_STATUSES,
  HELP_TYPES,
  MESSAGE_TYPES,
  MISSION_CONTRIBUTION_STATUSES,
  MISSION_RESOURCE_TYPES,
  MISSION_VERIFICATION_STATUSES,
  NOTIFICATION_KINDS,
  NOTIFICATION_RESOURCE_TYPES,
  PLATFORM_DONATION_STATUSES,
  REPORT_STATUSES,
  REQUEST_MODERATION_ACTIONS,
  REQUEST_SAFETY_FLAGS,
  REQUEST_URGENCIES,
  REQUEST_VISIBILITIES,
  SECURITY_EVENT_TYPES,
  SESSION_PLATFORMS,
  USER_ROLES,
  VERIFICATION_LEVELS,
  VERIFICATION_RECORD_STATUSES,
  CONVERSATION_STATUSES,
  MESSAGE_REPORT_REASONS,
  MESSAGE_SAFETY_FLAGS,
  REPORT_TARGET_TYPES,
  REQUEST_REPORT_REASONS,
  USER_REPORT_REASONS,
};

describe("domain enum definitions", () => {
  it.each(Object.entries(enumDefinitions))(
    "%s is frozen and contains unique strings",
    (name, values) => {
      expect(Object.isFrozen(values), `${name} should be frozen`).toBe(true);
      expect(values.length, `${name} should not be empty`).toBeGreaterThan(0);
      expect(
        values.every((value) => typeof value === "string" && value.length > 0),
      ).toBe(true);
      expect(
        new Set(values).size,
        `${name} should not contain duplicates`,
      ).toBe(values.length);
    },
  );

  it("uses the agreed request lifecycle values", () => {
    expect(HELP_REQUEST_STATUSES).toEqual([
      "draft",
      "pending_review",
      "changes_requested",
      "published",
      "partially_solved",
      "solved",
      "cancelled",
      "rejected",
      "expired",
    ]);
  });

  it("uses the agreed offer lifecycle values", () => {
    expect(HELP_OFFER_STATUSES).toEqual([
      "pending",
      "accepted",
      "rejected",
      "withdrawn",
      "in_progress",
      "completion_submitted",
      "completed",
      "disputed",
      "cancelled",
    ]);
  });
});
