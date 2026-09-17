import "dotenv/config";

import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { DonationRefund } from "../models/DonationRefund.js";
import { DonationWebhookEvent } from "../models/DonationWebhookEvent.js";
import { PlatformDonation } from "../models/PlatformDonation.js";

export async function createDonationIndexes(
  donationModel = PlatformDonation,
  eventModel = DonationWebhookEvent,
  refundModel = DonationRefund,
) {
  await donationModel.createIndexes();
  await eventModel.createIndexes();
  await refundModel.createIndexes();
}

async function run() {
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required to create donation indexes");
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    await createDonationIndexes();
    process.stdout.write("Donation indexes created or verified.\n");
  } finally {
    await mongoose.disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFile === invokedFile) {
  run().catch((error) => {
    process.stderr.write(`Donation index setup failed: ${error.name}\n`);
    process.exitCode = 1;
  });
}
