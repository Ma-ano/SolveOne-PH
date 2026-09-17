import "dotenv/config";

import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Notification } from "../models/Notification.js";

export async function createNotificationIndexes(model = Notification) {
  return model.createIndexes();
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required to create notification indexes");
  }

  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    await createNotificationIndexes();
    process.stdout.write("Notification indexes created or verified.\n");
  } finally {
    await mongoose.disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFile === invokedFile) {
  run().catch((error) => {
    process.stderr.write(`Notification index setup failed: ${error.name}\n`);
    process.exitCode = 1;
  });
}
