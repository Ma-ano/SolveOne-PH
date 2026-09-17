import { AppError } from "./AppError.js";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

function invalidCursor() {
  return new AppError({
    statusCode: 400,
    code: "INVALID_CURSOR",
    message: "Pagination cursor is invalid",
  });
}

function payloadFor({ scope, values }) {
  return {
    v: 1,
    scope,
    values: {
      skillMatch: values.skillMatch,
      verified: values.verified,
      urgency: values.urgency,
      neededBy: new Date(values.neededBy).toISOString(),
      nearby: values.nearby,
      publishedAt: new Date(values.publishedAt).toISOString(),
      id: String(values.id),
    },
  };
}

export function encodeDiscoveryCursor({ scope, values }) {
  return Buffer.from(JSON.stringify(payloadFor({ scope, values }))).toString(
    "base64url",
  );
}

export function decodeDiscoveryCursor(value, expectedScope) {
  if (!value) return null;
  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const values = decoded?.values;
    const neededBy = new Date(values?.neededBy);
    const publishedAt = new Date(values?.publishedAt);
    if (
      decoded?.v !== 1 ||
      decoded?.scope !== expectedScope ||
      !Number.isInteger(values?.skillMatch) ||
      values.skillMatch < 0 ||
      values.skillMatch > 15 ||
      ![0, 1].includes(values?.verified) ||
      ![0, 1, 2].includes(values?.urgency) ||
      ![0, 1, 2].includes(values?.nearby) ||
      !objectIdPattern.test(values?.id ?? "") ||
      Number.isNaN(neededBy.getTime()) ||
      Number.isNaN(publishedAt.getTime())
    ) {
      throw invalidCursor();
    }
    const normalized = {
      skillMatch: values.skillMatch,
      verified: values.verified,
      urgency: values.urgency,
      neededBy,
      nearby: values.nearby,
      publishedAt,
      id: values.id,
    };
    if (
      encodeDiscoveryCursor({ scope: decoded.scope, values: normalized }) !==
      value
    ) {
      throw invalidCursor();
    }
    return normalized;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw invalidCursor();
  }
}
