import { z } from "zod";

import {
  REPORT_STATUSES,
  REPORT_TARGET_TYPES,
  REQUEST_REPORT_REASONS,
  USER_REPORT_REASONS,
} from "../constants/statuses.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID is invalid");
const description = z.string().trim().min(10).max(1000).optional();
const cursorQuery = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).optional(),
};

export const safetySchemas = Object.freeze({
  reportUser: {
    params: z.object({ userId: objectId }).strict(),
    body: z
      .object({ reason: z.enum(USER_REPORT_REASONS), description })
      .strict(),
  },
  reportRequest: {
    params: z.object({ requestId: objectId }).strict(),
    body: z
      .object({ reason: z.enum(REQUEST_REPORT_REASONS), description })
      .strict(),
  },
  reportGiveaway: {
    params: z.object({ itemId: objectId }).strict(),
    body: z
      .object({ reason: z.enum(REQUEST_REPORT_REASONS), description })
      .strict(),
  },
  reportMission: {
    params: z.object({ missionId: objectId }).strict(),
    body: z
      .object({ reason: z.enum(REQUEST_REPORT_REASONS), description })
      .strict(),
  },
  userTarget: { params: z.object({ userId: objectId }).strict() },
  listBlocks: { query: z.object(cursorQuery).strict() },
  queue: {
    query: z
      .object({
        ...cursorQuery,
        status: z.enum(REPORT_STATUSES).default("open"),
        targetType: z.enum(REPORT_TARGET_TYPES).optional(),
      })
      .strict(),
  },
  reportTarget: { params: z.object({ reportId: objectId }).strict() },
  resolve: {
    params: z.object({ reportId: objectId }).strict(),
    body: z
      .object({
        outcome: z.enum(["resolved", "dismissed"]),
        resolution: z.string().trim().min(10).max(2000),
      })
      .strict(),
  },
  suspend: {
    params: z.object({ userId: objectId }).strict(),
    body: z.object({ reason: z.string().trim().min(10).max(1000) }).strict(),
  },
  reinstate: {
    params: z.object({ userId: objectId }).strict(),
    body: z.object({ reason: z.string().trim().min(10).max(1000) }).strict(),
  },
  audit: {
    query: z
      .object({
        ...cursorQuery,
        actorId: objectId.optional(),
        action: z.string().trim().min(1).max(100).optional(),
        targetType: z.string().trim().min(1).max(60).optional(),
      })
      .strict(),
  },
});
