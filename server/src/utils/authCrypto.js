import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export function generateOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashIpAddress(ipAddress, secret) {
  return createHmac("sha256", secret)
    .update(ipAddress || "unknown")
    .digest("hex");
}

export function safeHashEquals(left, right) {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}
