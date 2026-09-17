import { z } from "zod";

import {
  COMMUNITY_MISSION_STATUSES,
  MISSION_CONTRIBUTION_STATUSES,
  MISSION_RESOURCE_TYPES,
} from "../constants/statuses.js";

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "ID is invalid");
const category = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z][a-z0-9_]*$/, "Category must be a lowercase identifier");
const location = z
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
  .strict();
const resource = z
  .object({
    name: z.string().trim().min(3).max(100),
    description: z.string().trim().min(10).max(500),
    type: z.enum(MISSION_RESOURCE_TYPES),
    quantity: z.number().int().min(1).max(1000),
    estimatedMinutes: z.number().int().min(15).max(10080).optional(),
    requiredSkills: z
      .array(z.string().trim().min(2).max(50))
      .max(10)
      .default([]),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.type === "item" && value.estimatedMinutes !== undefined)
      context.addIssue({
        code: "custom",
        path: ["estimatedMinutes"],
        message: "Item resources cannot estimate time",
      });
    if (value.type === "item" && value.requiredSkills.length)
      context.addIssue({
        code: "custom",
        path: ["requiredSkills"],
        message: "Item resources cannot require skills",
      });
    if (value.type === "skill" && value.requiredSkills.length === 0)
      context.addIssue({
        code: "custom",
        path: ["requiredSkills"],
        message: "Skill resources require at least one skill",
      });
  });
const content = {
  title: z.string().trim().min(8).max(140),
  description: z.string().trim().min(40).max(5000),
  category,
  location,
  requiredResources: z.array(resource).min(1).max(20),
  evidenceNote: z.string().trim().min(20).max(2000),
};
const list = {
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).optional(),
};
const emptyBody = z.object({}).strict();
const missionParams = z.object({ missionId: objectId }).strict();
const contributionParams = z.object({ contributionId: objectId }).strict();

export const missionSchemas = Object.freeze({
  create: { body: z.object(content).strict() },
  update: { params: missionParams, body: z.object(content).partial().strict() },
  mission: { params: missionParams },
  transition: { params: missionParams, body: emptyBody },
  publicList: {
    query: z
      .object({
        ...list,
        category: category.optional(),
        resourceType: z.enum(MISSION_RESOURCE_TYPES).optional(),
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
        ...list,
        status: z.enum(COMMUNITY_MISSION_STATUSES).optional(),
      })
      .strict(),
  },
  matches: { query: z.object(list).strict() },
  moderationList: {
    query: z
      .object({
        ...list,
        status: z.literal("pending_review").default("pending_review"),
      })
      .strict(),
  },
  decision: {
    params: missionParams,
    body: z.object({ notes: z.string().trim().min(10).max(1000) }).strict(),
  },
  approve: { params: missionParams, body: emptyBody },
  createContribution: {
    params: missionParams,
    body: z
      .object({
        resourceId: objectId,
        message: z.string().trim().min(10).max(1000),
        quantity: z.number().int().min(1).max(1000),
        estimatedMinutes: z.number().int().min(1).max(10080).optional(),
      })
      .strict(),
  },
  contributionList: {
    params: missionParams,
    query: z
      .object({
        ...list,
        status: z.enum(MISSION_CONTRIBUTION_STATUSES).optional(),
      })
      .strict(),
  },
  myContributions: {
    query: z
      .object({
        ...list,
        status: z.enum(MISSION_CONTRIBUTION_STATUSES).optional(),
      })
      .strict(),
  },
  contributionTransition: { params: contributionParams, body: emptyBody },
  completeContribution: {
    params: contributionParams,
    body: z
      .object({
        note: z.string().trim().min(10).max(2000),
        actualMinutes: z.number().int().min(1).max(10080).optional(),
      })
      .strict(),
  },
});
