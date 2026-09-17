import { describe, expect, it } from "vitest";

import { detectMessageSafetyFlags } from "../src/utils/messageSafety.js";

describe("message safety flagging", () => {
  it("flags credential and suspicious payment requests without storing raw rules", () => {
    expect(
      detectMessageSafetyFlags(
        "Send your OTP and banking PIN, then transfer directly to my GCash.",
      ),
    ).toEqual(
      expect.arrayContaining(["credential_request", "suspicious_payment"]),
    );
  });

  it("flags repeated Philippine phone-number spam and leaves normal help alone", () => {
    expect(
      detectMessageSafetyFlags("Text 09171234567 or 09981234567 right now"),
    ).toContain("phone_spam");
    expect(
      detectMessageSafetyFlags("I can meet at the public library at 3 PM."),
    ).toEqual([]);
  });
});
