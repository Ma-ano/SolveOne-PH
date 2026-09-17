import { z } from "zod";

import {
  DATA_SUBJECT_REQUEST_STATUSES,
  DATA_SUBJECT_REQUEST_TYPES,
} from "../constants/statuses.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID is invalid");
const page = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).optional(),
};

export const privacyRequestSchemas = Object.freeze({
  submit: {
    body: z
      .object({
        requestType: z.enum(DATA_SUBJECT_REQUEST_TYPES),
        details: z.string().trim().min(20).max(2000),
        acknowledgement: z.literal(true),
      })
      .strict(),
  },
  ownerList: { query: z.object(page).strict() },
  target: { params: z.object({ requestId: objectId }).strict() },
  adminList: {
    query: z
      .object({
        ...page,
        status: z.enum(DATA_SUBJECT_REQUEST_STATUSES).default("submitted"),
        requestType: z.enum(DATA_SUBJECT_REQUEST_TYPES).optional(),
      })
      .strict(),
  },
  resolve: {
    params: z.object({ requestId: objectId }).strict(),
    body: z
      .object({
        outcome: z.enum(["completed", "denied"]),
        resolutionSummary: z.string().trim().min(20).max(2000),
        identityVerified: z.literal(true),
        scopeReviewed: z.literal(true),
        retentionReviewed: z.literal(true),
      })
      .strict(),
  },
});
