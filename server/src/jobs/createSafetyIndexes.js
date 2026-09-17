import "dotenv/config";

import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { AuditLog } from "../models/AuditLog.js";
import { Report } from "../models/Report.js";
import { UserBlock } from "../models/UserBlock.js";

function hasCurrentReportActiveIndex(index) {
  return (
    index?.unique === true &&
    index?.partialFilterExpression?.activeKey?.$type === "string"
  );
}

export async function createSafetyIndexes(
  reportModel = Report,
  blockModel = UserBlock,
  auditModel = AuditLog,
) {
  const indexes = await reportModel.collection.indexes();
  const activeIndex = indexes.find(
    (index) => index.name === "report_active_unique",
  );
  if (activeIndex && !hasCurrentReportActiveIndex(activeIndex)) {
    await reportModel.collection.dropIndex("report_active_unique");
  }
  await reportModel.createIndexes();
  await blockModel.createIndexes();
  await auditModel.createIndexes();
}

async function run() {
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required to create safety indexes");
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    await createSafetyIndexes();
    process.stdout.write("Safety indexes created or verified.\n");
  } finally {
    await mongoose.disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFile === invokedFile) {
  run().catch((error) => {
    process.stderr.write(`Safety index setup failed: ${error.name}\n`);
    process.exitCode = 1;
  });
}
