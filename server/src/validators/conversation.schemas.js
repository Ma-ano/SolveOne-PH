import { z } from "zod";

import { MESSAGE_REPORT_REASONS } from "../constants/statuses.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID is invalid");
const conversationParams = z.object({ conversationId: objectId }).strict();
const messageParams = z.object({ messageId: objectId }).strict();
const listQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(500).optional(),
  })
  .strict();

export const conversationSchemas = Object.freeze({
  list: { query: listQuery },
  get: { params: conversationParams },
  messages: { params: conversationParams, query: listQuery },
  send: {
    params: conversationParams,
    body: z
      .object({
        type: z.literal("text"),
        content: z.string().trim().min(1).max(2000),
        clientMessageId: z
          .string()
          .regex(/^[A-Za-z0-9_-]{16,100}$/, "Client message ID is invalid"),
      })
      .strict(),
  },
  read: {
    params: conversationParams,
    body: z.object({ messageId: objectId }).strict(),
  },
  report: {
    params: messageParams,
    body: z
      .object({
        reason: z.enum(MESSAGE_REPORT_REASONS),
        description: z.string().trim().min(10).max(1000).optional(),
      })
      .strict(),
  },
});
