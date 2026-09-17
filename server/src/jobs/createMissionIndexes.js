import "dotenv/config";

import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CommunityMission } from "../models/CommunityMission.js";
import { MissionContribution } from "../models/MissionContribution.js";

export async function createMissionIndexes(
  missionModel = CommunityMission,
  contributionModel = MissionContribution,
) {
  const [missionIndexes, contributionIndexes] = await Promise.all([
    missionModel.createIndexes(),
    contributionModel.createIndexes(),
  ]);
  return { missionIndexes, contributionIndexes };
}

async function run() {
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required to create mission indexes");
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
  try {
    await createMissionIndexes();
    process.stdout.write("Community mission indexes created or verified.\n");
  } finally {
    await mongoose.disconnect();
  }
}

const currentFile = fileURLToPath(import.meta.url);
const invokedFile = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFile === invokedFile) {
  run().catch((error) => {
    process.stderr.write(
      `Community mission index setup failed: ${error.name}\n`,
    );
    process.exitCode = 1;
  });
}
