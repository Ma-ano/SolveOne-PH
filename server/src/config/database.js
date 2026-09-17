import mongoose from "mongoose";

export function databaseIsReady() {
  return mongoose.connection.readyState === 1;
}

export async function connectDatabase({
  mongoUri,
  serverSelectionTimeoutMs = 10000,
  environment = "development",
  logger,
}) {
  await mongoose.connect(mongoUri, {
    autoIndex: environment !== "production",
    serverSelectionTimeoutMS: serverSelectionTimeoutMs,
  });

  logger?.info({ databaseName: mongoose.connection.name }, "MongoDB connected");
  return mongoose.connection;
}

export async function disconnectDatabase({ logger } = {}) {
  if (mongoose.connection.readyState === 0) {
    return;
  }

  await mongoose.disconnect();
  logger?.info("MongoDB disconnected");
}
