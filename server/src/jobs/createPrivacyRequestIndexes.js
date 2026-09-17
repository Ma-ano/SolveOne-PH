import "dotenv/config";

import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AuditLog } from "../models/AuditLog.js";
import { DataSubjectRequest } from "../models/DataSubjectRequest.js";

export async function createPrivacyRequestIndexes(
  requestModel = DataSubjectRequest,
  auditModel = AuditLog,
) {
  await requestModel.createIndexes();
  await auditModel.createIndexes();
}

async function run() {
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required to create privacy indexes");
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    await createPrivacyRequestIndexes();
    process.stdout.write("Privacy-request indexes created or verified.\n");
  } finally {
    await mongoose.disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFile === invokedFile) {
  run().catch((error) => {
    process.stderr.write(`Privacy index setup failed: ${error.name}\n`);
    process.exitCode = 1;
  });
}
