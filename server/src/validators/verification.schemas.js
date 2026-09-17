import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID is invalid");
const recordParams = z.object({ recordId: objectId }).strict();

export const verificationSchemas = Object.freeze({
  queue: {
    query: z
      .object({
        limit: z.coerce.number().int().min(1).max(30).default(10),
        cursor: z.string().max(500).optional(),
      })
      .strict(),
  },
  submit: {
    body: z
      .object({
        uploadIds: z
          .array(objectId)
          .min(1)
          .max(2)
          .refine(
            (ids) => new Set(ids).size === ids.length,
            "Files must differ",
          ),
        acknowledged: z.literal(true),
      })
      .strict(),
  },
  claim: { params: recordParams, body: z.object({}).strict() },
  approve: { params: recordParams, body: z.object({}).strict() },
  reject: {
    params: recordParams,
    body: z.object({ reason: z.string().trim().min(10).max(1000) }).strict(),
  },
  document: {
    params: z.object({ recordId: objectId, uploadId: objectId }).strict(),
  },
});
