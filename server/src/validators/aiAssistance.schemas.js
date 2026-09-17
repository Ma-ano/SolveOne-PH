import { z } from "zod";

import { HELP_TYPES } from "../constants/statuses.js";

export const AI_REQUEST_CATEGORIES = Object.freeze([
  "education",
  "food",
  "health",
  "housing",
  "livelihood",
  "transportation",
  "digital_alalay",
  "electronics",
  "clothing",
  "books",
  "mobility",
  "household",
  "other",
]);

const uniqueValues = (values) => new Set(values).size === values.length;

const aiNeedItemSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().min(10).max(500),
    type: z.enum(HELP_TYPES),
  })
  .strict();

export const aiRequestSuggestionSchema = z
  .object({
    title: z.string().trim().min(8).max(120),
    description: z.string().trim().min(40).max(1000),
    category: z.enum(AI_REQUEST_CATEGORIES),
    helpTypes: z
      .array(z.enum(HELP_TYPES))
      .min(1)
      .max(HELP_TYPES.length)
      .refine(uniqueValues, "Help types must be unique"),
    needItems: z.array(aiNeedItemSchema).min(1).max(10),
    requiredSkills: z
      .array(z.string().trim().min(2).max(50))
      .max(10)
      .refine(uniqueValues, "Required skills must be unique"),
    followUpQuestions: z.array(z.string().trim().min(8).max(200)).max(8),
  })
  .strict()
  .superRefine((value, context) => {
    const itemTypes = new Set(value.needItems.map((item) => item.type));
    for (const type of itemTypes) {
      if (!value.helpTypes.includes(type)) {
        context.addIssue({
          code: "custom",
          path: ["helpTypes"],
          message: `Help types must include ${type}`,
        });
      }
    }
  });

export const aiAssistanceSchemas = Object.freeze({
  structureRequest: {
    body: z
      .object({
        description: z.string().trim().min(20).max(2000),
        consent: z.literal(true),
      })
      .strict(),
  },
});
