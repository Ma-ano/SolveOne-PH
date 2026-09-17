import "dotenv/config";

import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { HelpRequest } from "../models/HelpRequest.js";

export function createDiscoveryIndexes(model = HelpRequest) {
  return model.createIndexes();
}

async function run() {
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required to create discovery indexes");
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    await createDiscoveryIndexes();
    process.stdout.write("Discovery indexes created or verified.\n");
  } finally {
    await mongoose.disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFile === invokedFile) {
  run().catch((error) => {
    process.stderr.write(`Discovery index setup failed: ${error.name}\n`);
    process.exitCode = 1;
  });
}
