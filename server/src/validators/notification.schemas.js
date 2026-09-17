import { z } from "zod";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID is invalid");

export const notificationSchemas = Object.freeze({
  list: {
    query: z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(20),
        cursor: z.string().max(500).optional(),
        unreadOnly: z
          .enum(["true", "false"])
          .transform((value) => value === "true")
          .default("false"),
      })
      .strict(),
  },
  read: {
    params: z.object({ notificationId: objectId }).strict(),
    body: z.object({}).strict(),
  },
  readAll: { body: z.object({}).strict() },
});
