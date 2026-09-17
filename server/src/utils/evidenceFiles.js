import { AppError } from "./AppError.js";

export const MAX_EVIDENCE_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_EVIDENCE_FILES = 4;

const types = Object.freeze({
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
});

function detectedMimeType(bytes) {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  )
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-")
    return "application/pdf";
  return null;
}

export function validateEvidenceFile({ bytes, mimeType, name }) {
  const suppliedMime = mimeType?.split(";")[0].trim().toLowerCase();
  const cleanName = name?.trim();
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 8 ||
    bytes.length > MAX_EVIDENCE_FILE_BYTES ||
    !cleanName ||
    cleanName.length > 120 ||
    // Control characters are intentionally rejected from user filenames.
    // eslint-disable-next-line no-control-regex
    /[\\/\x00-\x1f]/.test(cleanName) ||
    !types[suppliedMime] ||
    !types[suppliedMime].some((extension) =>
      cleanName.toLowerCase().endsWith(extension),
    ) ||
    detectedMimeType(bytes) !== suppliedMime
  ) {
    throw new AppError({
      statusCode: 422,
      code: "EVIDENCE_FILE_INVALID",
      message:
        "Evidence must be a JPEG, PNG, WebP, or PDF matching its filename and MIME type, up to 5 MB",
    });
  }
  return { name: cleanName, mimeType: suppliedMime, size: bytes.length };
}
