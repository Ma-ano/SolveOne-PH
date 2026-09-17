import { z } from "zod";

export const missionCategories = Object.freeze([
  "community_repair",
  "accessibility",
  "cleanup",
  "public_safety",
  "community_supplies",
  "other",
]);

export const missionResourceTypes = Object.freeze(["item", "skill", "time"]);

const resourceSchema = z
  .object({
    name: z.string().trim().min(3, "Use at least 3 characters").max(100),
    description: z
      .string()
      .trim()
      .min(10, "Describe the exact resource")
      .max(500),
    type: z.enum(missionResourceTypes),
    quantity: z.coerce.number().int().min(1).max(1000),
    estimatedMinutes: z.string().trim(),
    requiredSkillsText: z.string().trim().max(300),
  })
  .superRefine((value, context) => {
    if (
      value.type !== "item" &&
      (!value.estimatedMinutes || Number(value.estimatedMinutes) < 15)
    )
      context.addIssue({
        code: "custom",
        path: ["estimatedMinutes"],
        message: "Estimate at least 15 minutes",
      });
    if (value.type === "skill" && !value.requiredSkillsText)
      context.addIssue({
        code: "custom",
        path: ["requiredSkillsText"],
        message: "Add at least one required skill",
      });
  });

export const missionFormSchema = z.object({
  title: z.string().trim().min(8).max(140),
  description: z
    .string()
    .trim()
    .min(40, "Explain the community need in at least 40 characters")
    .max(5000),
  category: z.enum(missionCategories),
  country: z.string().trim().min(1).max(80),
  province: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  barangay: z.string().trim().max(120),
  evidenceNote: z
    .string()
    .trim()
    .min(20, "Explain how this need and permission were verified")
    .max(2000),
  requiredResources: z.array(resourceSchema).min(1).max(5),
});

export const emptyMissionForm = Object.freeze({
  title: "",
  description: "",
  category: "community_repair",
  country: "Philippines",
  province: "",
  city: "",
  barangay: "",
  evidenceNote: "",
  requiredResources: [
    {
      name: "",
      description: "",
      type: "time",
      quantity: "1",
      estimatedMinutes: "60",
      requiredSkillsText: "",
    },
  ],
});

export function missionFormToPayload(values) {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    category: values.category,
    location: {
      country: values.country.trim(),
      province: values.province.trim(),
      city: values.city.trim(),
      ...(values.barangay.trim() ? { barangay: values.barangay.trim() } : {}),
    },
    requiredResources: values.requiredResources.map((resource) => ({
      name: resource.name.trim(),
      description: resource.description.trim(),
      type: resource.type,
      quantity: Number(resource.quantity),
      ...(resource.type !== "item"
        ? { estimatedMinutes: Number(resource.estimatedMinutes) }
        : {}),
      requiredSkills:
        resource.type === "item"
          ? []
          : [
              ...new Set(
                resource.requiredSkillsText
                  .split(",")
                  .map((skill) => skill.trim().toLocaleLowerCase("en"))
                  .filter(Boolean),
              ),
            ],
    })),
    evidenceNote: values.evidenceNote.trim(),
  };
}

export function missionToForm(mission) {
  return {
    title: mission.title,
    description: mission.description,
    category: mission.category,
    country: mission.location?.country ?? "Philippines",
    province: mission.location?.province ?? "",
    city: mission.location?.city ?? "",
    barangay: mission.location?.barangay ?? "",
    evidenceNote: mission.evidence?.note ?? "",
    requiredResources: mission.requiredResources.map((resource) => ({
      name: resource.name,
      description: resource.description,
      type: resource.type,
      quantity: String(resource.quantity),
      estimatedMinutes: resource.estimatedMinutes
        ? String(resource.estimatedMinutes)
        : "",
      requiredSkillsText: resource.requiredSkills.join(", "),
    })),
  };
}
