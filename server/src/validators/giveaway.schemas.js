import { z } from "zod";

import {
  GIVEAWAY_ITEM_CONDITIONS,
  GIVEAWAY_ITEM_STATUSES,
  GIVEAWAY_RESERVATION_STATUSES,
} from "../constants/statuses.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID is invalid");
const category = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, "Category must be a lowercase identifier");
const emptyBody = z.object({}).strict();
const listFields = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).optional(),
};

export const giveawaySchemas = Object.freeze({
  create: {
    body: z
      .object({
        title: z.string().trim().min(5).max(120),
        description: z.string().trim().min(20).max(2000),
        category,
        condition: z.enum(GIVEAWAY_ITEM_CONDITIONS),
        quantity: z.number().int().min(1).max(100),
        location: z
          .object({
            country: z.string().trim().min(1).max(80).default("Philippines"),
            province: z.string().trim().min(1).max(80),
            city: z.string().trim().min(1).max(80),
            barangay: z
              .string()
              .trim()
              .max(120)
              .transform((value) => value || null)
              .nullable()
              .optional(),
          })
          .strict(),
      })
      .strict(),
  },
  publicList: {
    query: z
      .object({
        ...listFields,
        category: category.optional(),
        condition: z.enum(GIVEAWAY_ITEM_CONDITIONS).optional(),
        province: z.string().trim().min(1).max(80).optional(),
        city: z.string().trim().min(1).max(80).optional(),
      })
      .strict()
      .superRefine((value, context) => {
        if (value.city && !value.province)
          context.addIssue({
            code: "custom",
            path: ["province"],
            message: "Province is required when filtering by city",
          });
      }),
  },
  mine: {
    query: z
      .object({
        ...listFields,
        status: z.enum(GIVEAWAY_ITEM_STATUSES).optional(),
      })
      .strict(),
  },
  item: { params: z.object({ itemId: objectId }).strict() },
  matches: {
    params: z.object({ itemId: objectId }).strict(),
    query: z.object(listFields).strict(),
  },
  reserve: {
    params: z.object({ itemId: objectId }).strict(),
    body: z
      .object({
        requestId: objectId,
        needItemId: objectId,
        quantity: z.number().int().min(1).max(100),
      })
      .strict(),
  },
  remove: {
    params: z.object({ itemId: objectId }).strict(),
    body: emptyBody,
  },
  reservations: {
    query: z
      .object({
        ...listFields,
        status: z.enum(GIVEAWAY_RESERVATION_STATUSES).optional(),
      })
      .strict(),
  },
  reservationTransition: {
    params: z.object({ reservationId: objectId }).strict(),
    body: emptyBody,
  },
});
