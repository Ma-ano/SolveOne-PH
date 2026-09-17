import "dotenv/config";

import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { GiveawayItem } from "../models/GiveawayItem.js";
import { GiveawayReservation } from "../models/GiveawayReservation.js";

export async function createGiveawayIndexes(
  itemModel = GiveawayItem,
  reservationModel = GiveawayReservation,
) {
  const [itemIndexes, reservationIndexes] = await Promise.all([
    itemModel.createIndexes(),
    reservationModel.createIndexes(),
  ]);
  return { itemIndexes, reservationIndexes };
}

async function run() {
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required to create giveaway indexes");
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    await createGiveawayIndexes();
    process.stdout.write("Giveaway indexes created or verified.\n");
  } finally {
    await mongoose.disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFile === invokedFile) {
  run().catch((error) => {
    process.stderr.write(`Giveaway index setup failed: ${error.name}\n`);
    process.exitCode = 1;
  });
}
