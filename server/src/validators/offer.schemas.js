import { z } from "zod";

import { HELP_OFFER_STATUSES } from "../constants/statuses.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID is invalid");
const message = z.string().trim().min(10).max(1000);
const common = {
  needItemId: objectId,
  message,
};
const requestParams = z.object({ requestId: objectId }).strict();
const offerParams = z.object({ offerId: objectId }).strict();
const emptyBody = z.object({}).strict();

export function createOfferSchemas(config) {
  const body = z.discriminatedUnion("helpType", [
    z
      .object({
        ...common,
        helpType: z.literal("money"),
        pledgedValueCentavos: z
          .number()
          .int()
          .min(1)
          .max(config.maxRequestEstimatedValueCentavos),
      })
      .strict(),
    z
      .object({
        ...common,
        helpType: z.literal("item"),
        quantity: z.number().int().min(1).max(10000),
      })
      .strict(),
    z
      .object({
        ...common,
        helpType: z.literal("skill"),
        quantity: z.number().int().min(1).max(10000),
        estimatedMinutes: z.number().int().min(1).max(10080),
      })
      .strict(),
    z
      .object({
        ...common,
        helpType: z.literal("time"),
        quantity: z.number().int().min(1).max(10000),
        estimatedMinutes: z.number().int().min(1).max(10080),
      })
      .strict(),
  ]);

  const listQuery = z
    .object({
      limit: z.coerce.number().int().min(1).max(50).default(20),
      cursor: z.string().max(500).optional(),
      status: z.enum(HELP_OFFER_STATUSES).optional(),
    })
    .strict();

  return Object.freeze({
    create: { params: requestParams, body },
    mine: { query: listQuery },
    forRequest: { params: requestParams, query: listQuery },
    transition: { params: offerParams, body: emptyBody },
    complete: {
      params: offerParams,
      body: z
        .object({
          note: z.string().trim().min(10).max(2000),
          actualMinutes: z.number().int().min(1).max(10080).optional(),
          fileIds: z
            .array(objectId)
            .max(4)
            .refine(
              (ids) => new Set(ids).size === ids.length,
              "Evidence file IDs must be unique",
            )
            .optional(),
        })
        .strict(),
    },
    dispute: {
      params: offerParams,
      body: z.object({ reason: z.string().trim().min(10).max(2000) }).strict(),
    },
    evidence: { params: offerParams },
    evidenceFile: {
      params: z.object({ offerId: objectId, fileId: objectId }).strict(),
    },
  });
}
