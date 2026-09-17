import { AppError } from "./AppError.js";

export const MAX_IDENTITY_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_IDENTITY_FILES = 2;

export function validateIdentityImage(bytes, mimeType) {
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 20 ||
    bytes.length > MAX_IDENTITY_FILE_BYTES
  )
    throw new AppError({
      statusCode: 422,
      code: "IDENTITY_FILE_INVALID",
      message: "Use a JPEG or PNG identity image up to 4 MB",
    });
  const claimed =
    typeof mimeType === "string"
      ? mimeType.split(";")[0].trim().toLowerCase()
      : "";
  const jpeg =
    bytes?.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex")) &&
    bytes?.subarray(-2).equals(Buffer.from("ffd9", "hex"));
  const png =
    bytes?.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")) &&
    bytes?.toString("ascii", 12, 16) === "IHDR" &&
    bytes.toString("ascii", bytes.length - 8, bytes.length - 4) === "IEND";
  if ((claimed !== "image/jpeg" || !jpeg) && (claimed !== "image/png" || !png))
    throw new AppError({
      statusCode: 422,
      code: "IDENTITY_FILE_INVALID",
      message: "Use a JPEG or PNG identity image up to 4 MB",
    });
  return { mimeType: claimed, size: bytes.length };
}
