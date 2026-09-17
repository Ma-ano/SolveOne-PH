import { z } from "zod";

import {
  HELP_TYPES,
  REQUEST_URGENCIES,
  REQUEST_VISIBILITIES,
} from "../constants/statuses.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "Request ID is invalid");
const optionalLocationValue = (maximum) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null)
    .nullable()
    .optional();

const privateLocation = z
  .object({
    country: optionalLocationValue(80),
    province: optionalLocationValue(80),
    city: optionalLocationValue(80),
    barangay: optionalLocationValue(120),
  })
  .strict();

function uniqueStrings(schema, maximum, label) {
  return z
    .array(schema)
    .max(maximum)
    .superRefine((values, context) => {
      const seen = new Set();

      values.forEach((value, index) => {
        const key = value.toLocaleLowerCase("en");
        if (seen.has(key)) {
          context.addIssue({
            code: "custom",
            path: [index],
            message: `${label} must be unique`,
          });
        }
        seen.add(key);
      });
    });
}

const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Needed-by date must use YYYY-MM-DD")
  .refine(
    (value) => {
      const date = new Date(`${value}T23:59:59.999Z`);
      return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
      );
    },
    { message: "Needed-by date is invalid" },
  )
  .transform((value) => new Date(`${value}T23:59:59.999Z`));

const category = z
  .string()
  .trim()
  .max(60)
  .regex(/^$|^[a-z][a-z0-9_]*$/, "Category must be a lowercase identifier");

const discoveryLocationFields = {
  city: z.string().trim().min(1).max(80).optional(),
  province: z.string().trim().min(1).max(80).optional(),
};

const discoverySkills = z
  .string()
  .trim()
  .min(1)
  .max(800)
  .transform((value) => value.split(",").map((skill) => skill.trim()))
  .pipe(uniqueStrings(z.string().min(1).max(50), 15, "Skills"));

function requireProvinceForCity(value, context) {
  if (value.city && !value.province) {
    context.addIssue({
      code: "custom",
      path: ["province"],
      message: "Province is required when filtering by city",
    });
  }
}

export function createRequestSchemas(config) {
  const budgetPesos = z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/,
      "Budget must be a PHP amount with at most two decimal places",
    )
    .transform((value) => {
      const [pesos, centavos = ""] = value.split(".");
      return Number(pesos) * 100 + Number(centavos.padEnd(2, "0"));
    })
    .refine(
      (value) => value >= 1 && value <= config.maxRequestEstimatedValueCentavos,
      {
        message: `Budget must be between PHP 0.01 and PHP ${config.maxRequestEstimatedValueCentavos / 100}`,
      },
    );
  const needItem = z
    .object({
      name: z.string().trim().max(100),
      description: z.string().trim().max(500).default(""),
      type: z.enum(HELP_TYPES),
      quantity: z.number().int().min(1).max(10000),
      estimatedValueCentavos: z
        .number()
        .int()
        .min(0)
        .max(config.maxRequestEstimatedValueCentavos),
      estimatedMinutes: z
        .number()
        .int()
        .min(15)
        .max(10080)
        .nullable()
        .optional(),
    })
    .strict()
    .superRefine((value, context) => {
      if (
        !["skill", "time"].includes(value.type) &&
        value.estimatedMinutes !== null &&
        value.estimatedMinutes !== undefined
      ) {
        context.addIssue({
          code: "custom",
          path: ["estimatedMinutes"],
          message: "Only skill or time needs can estimate minutes",
        });
      }
    });

  const editableFields = {
    title: z.string().trim().max(120).optional(),
    description: z.string().trim().max(5000).optional(),
    category: category.optional(),
    helpTypes: uniqueStrings(
      z.enum(HELP_TYPES),
      HELP_TYPES.length,
      "Help types",
    ).optional(),
    visibility: z.enum(REQUEST_VISIBILITIES).optional(),
    urgency: z.enum(REQUEST_URGENCIES).optional(),
    location: privateLocation.nullable().optional(),
    neededBy: dateOnly.nullable().optional(),
    needItems: z.array(needItem).max(config.maxRequestNeedItems).optional(),
    requiredSkills: uniqueStrings(
      z.string().trim().min(1).max(50),
      15,
      "Required skills",
    ).optional(),
  };

  const requestParams = {
    params: z.object({ requestId: objectId }).strict(),
  };

  return Object.freeze({
    createDraft: { body: z.object(editableFields).strict() },
    updateDraft: {
      ...requestParams,
      body: z
        .object(editableFields)
        .strict()
        .refine((value) => Object.keys(value).length > 0, {
          message: "At least one editable request field is required",
        }),
    },
    requestId: requestParams,
    publicList: {
      query: z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(500).optional(),
          category: category.refine(Boolean).optional(),
          helpType: z.enum(HELP_TYPES).optional(),
          urgency: z.enum(REQUEST_URGENCIES).optional(),
        })
        .strict(),
    },
    discoveryList: {
      query: z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(2000).optional(),
          mode: z
            .enum(["relevant", "skills", "no_money", "nearby"])
            .default("relevant"),
          skills: discoverySkills.optional(),
          category: category.refine(Boolean).optional(),
          helpType: z.enum(HELP_TYPES).optional(),
          urgency: z.enum(REQUEST_URGENCIES).optional(),
          ...discoveryLocationFields,
        })
        .strict()
        .superRefine(requireProvinceForCity),
    },
    solvableList: {
      query: z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(2000).optional(),
          budget: budgetPesos,
          category: category.refine(Boolean).optional(),
          urgency: z.enum(REQUEST_URGENCIES).optional(),
          ...discoveryLocationFields,
        })
        .strict()
        .superRefine(requireProvinceForCity),
    },
    ownerList: {
      query: z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(500).optional(),
        })
        .strict(),
    },
    moderationList: {
      query: z
        .object({
          limit: z.coerce.number().int().min(1).max(50).default(20),
          cursor: z.string().max(500).optional(),
          status: z
            .enum([
              "pending_review",
              "changes_requested",
              "published",
              "rejected",
            ])
            .default("pending_review"),
        })
        .strict(),
    },
    approve: { ...requestParams, body: z.object({}).strict() },
    decisionWithNotes: {
      ...requestParams,
      body: z.object({ notes: z.string().trim().min(10).max(1000) }).strict(),
    },
  });
}
