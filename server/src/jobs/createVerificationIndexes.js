import "dotenv/config";

import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { VerificationRecord } from "../models/VerificationRecord.js";
import { VerificationUpload } from "../models/VerificationUpload.js";

export async function createVerificationIndexes(
  recordModel = VerificationRecord,
  uploadModel = VerificationUpload,
) {
  await recordModel.createIndexes();
  await uploadModel.createIndexes();
}

async function run() {
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required to create verification indexes");
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    await createVerificationIndexes();
    process.stdout.write("Verification indexes created or verified.\n");
  } finally {
    await mongoose.disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFile === invokedFile) {
  run().catch((error) => {
    process.stderr.write(`Verification index setup failed: ${error.name}\n`);
    process.exitCode = 1;
  });
}
