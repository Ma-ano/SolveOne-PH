import { describe, expect, it } from "vitest";

import {
  decodeDiscoveryCursor,
  encodeDiscoveryCursor,
} from "../src/utils/discoveryCursor.js";

const values = Object.freeze({
  skillMatch: 2,
  verified: 1,
  urgency: 2,
  neededBy: new Date("2026-10-01T00:00:00.000Z"),
  nearby: 2,
  publishedAt: new Date("2026-09-01T00:00:00.000Z"),
  id: "0123456789abcdef01234567",
});

describe("discovery cursor", () => {
  it("round-trips the deterministic ranking tuple", () => {
    const cursor = encodeDiscoveryCursor({ scope: "discovery:scope", values });
    expect(decodeDiscoveryCursor(cursor, "discovery:scope")).toEqual(values);
  });

  it("rejects a cursor reused for a different discovery scope", () => {
    const cursor = encodeDiscoveryCursor({ scope: "discovery:one", values });
    expect(() => decodeDiscoveryCursor(cursor, "discovery:two")).toThrowError(
      expect.objectContaining({ code: "INVALID_CURSOR", statusCode: 400 }),
    );
  });

  it("rejects non-canonical and out-of-range tuples", () => {
    const payload = {
      v: 1,
      scope: "discovery:scope",
      values: {
        ...values,
        skillMatch: 99,
        neededBy: values.neededBy.toISOString(),
        publishedAt: values.publishedAt.toISOString(),
      },
    };
    const cursor = Buffer.from(JSON.stringify(payload)).toString("base64url");
    expect(() => decodeDiscoveryCursor(cursor, "discovery:scope")).toThrowError(
      expect.objectContaining({ code: "INVALID_CURSOR" }),
    );
  });
});
