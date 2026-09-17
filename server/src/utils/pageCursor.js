import { AppError } from "./AppError.js";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

function invalidCursor() {
  return new AppError({
    statusCode: 400,
    code: "INVALID_CURSOR",
    message: "Pagination cursor is invalid",
  });
}

export function encodePageCursor({ scope, date, id }) {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      scope,
      date: new Date(date).toISOString(),
      id: String(id),
    }),
  ).toString("base64url");
}

export function decodePageCursor(value, expectedScope) {
  if (!value) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    const date = new Date(decoded.date);

    if (
      decoded.v !== 1 ||
      decoded.scope !== expectedScope ||
      !objectIdPattern.test(decoded.id) ||
      Number.isNaN(date.getTime()) ||
      encodePageCursor({ scope: decoded.scope, date, id: decoded.id }) !== value
    ) {
      throw invalidCursor();
    }

    return { date, id: decoded.id };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw invalidCursor();
  }
}
