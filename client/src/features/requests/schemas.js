import { z } from "zod";

export const helpTypes = Object.freeze(["money", "item", "skill", "time"]);
export const requestUrgencies = Object.freeze([
  "normal",
  "important",
  "time_sensitive",
]);
export const requestCategories = Object.freeze([
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

const moneyPattern = /^\d{1,9}(?:\.\d{1,2})?$/;
const optionalText = (maximum) => z.string().trim().max(maximum);

const needItemSchema = z.object({
  name: optionalText(100),
  description: optionalText(500),
  type: z.enum(helpTypes),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+$/, "Use a whole number")
    .refine((value) => Number(value) >= 1 && Number(value) <= 10000, {
      message: "Quantity must be between 1 and 10,000",
    }),
  estimatedValuePesos: z
    .string()
    .trim()
    .refine((value) => value === "" || moneyPattern.test(value), {
      message: "Use a PHP amount with up to two decimal places",
    }),
  estimatedMinutes: z
    .string()
    .trim()
    .refine(
      (value) =>
        value === "" ||
        (/^\d+$/.test(value) && Number(value) >= 15 && Number(value) <= 10080),
      { message: "Use 15 to 10,080 minutes" },
    ),
});

export const requestDraftFormSchema = z.object({
  title: optionalText(120),
  description: optionalText(5000),
  category: z.enum(requestCategories),
  helpTypes: z.array(z.enum(helpTypes)),
  urgency: z.enum(requestUrgencies),
  country: optionalText(80),
  province: optionalText(80),
  city: optionalText(80),
  barangay: optionalText(120),
  neededBy: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value),
      "Use YYYY-MM-DD",
    ),
  requiredSkillsText: optionalText(800),
  needItems: z.array(needItemSchema),
});

export const emptyRequestForm = Object.freeze({
  title: "",
  description: "",
  category: "education",
  helpTypes: ["item"],
  urgency: "normal",
  country: "Philippines",
  province: "",
  city: "",
  barangay: "",
  neededBy: "",
  requiredSkillsText: "",
  needItems: [],
});

function pesosToCentavos(value) {
  if (!value) {
    return 0;
  }
  const [pesos, centavos = ""] = value.split(".");
  return Number(pesos) * 100 + Number(centavos.padEnd(2, "0"));
}

export function requestFormToPayload(values) {
  return {
    title: values.title,
    description: values.description,
    category: values.category,
    helpTypes: values.helpTypes,
    visibility: "public",
    urgency: values.urgency,
    location: {
      country: values.country,
      province: values.province,
      city: values.city,
      barangay: values.barangay,
    },
    neededBy: values.neededBy || null,
    requiredSkills: values.requiredSkillsText
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean),
    needItems: values.needItems.map((item) => ({
      name: item.name,
      description: item.description,
      type: item.type,
      quantity: Number(item.quantity),
      estimatedValueCentavos: pesosToCentavos(item.estimatedValuePesos),
      estimatedMinutes: ["skill", "time"].includes(item.type)
        ? item.estimatedMinutes
          ? Number(item.estimatedMinutes)
          : null
        : null,
    })),
  };
}

export function requestToFormValues(request) {
  if (!request) {
    return { ...emptyRequestForm, helpTypes: [...emptyRequestForm.helpTypes] };
  }
  return {
    title: request.title ?? "",
    description: request.description ?? "",
    category: request.category || "education",
    helpTypes: request.helpTypes?.length ? [...request.helpTypes] : ["item"],
    urgency: request.urgency ?? "normal",
    country: request.location?.country ?? "Philippines",
    province: request.location?.province ?? "",
    city: request.location?.city ?? "",
    barangay: request.location?.barangay ?? "",
    neededBy: request.neededBy?.slice(0, 10) ?? "",
    requiredSkillsText: (request.requiredSkills ?? []).join(", "),
    needItems: (request.needItems ?? []).map((item) => ({
      name: item.name ?? "",
      description: item.description ?? "",
      type: item.type ?? "item",
      quantity: String(item.quantity ?? 1),
      estimatedValuePesos: item.estimatedValueCentavos
        ? (item.estimatedValueCentavos / 100).toFixed(2)
        : "",
      estimatedMinutes: item.estimatedMinutes
        ? String(item.estimatedMinutes)
        : "",
    })),
  };
}
