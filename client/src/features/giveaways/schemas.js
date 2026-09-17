import { z } from "zod";

export const giveawayCategories = Object.freeze([
  "education",
  "electronics",
  "clothing",
  "books",
  "health",
  "mobility",
  "household",
  "livelihood",
  "other",
]);

export const giveawayConditions = Object.freeze([
  "new",
  "good",
  "used",
  "needs_minor_repair",
]);

export const giveawayFormSchema = z.object({
  title: z.string().trim().min(5).max(120),
  description: z.string().trim().min(20).max(2000),
  category: z.enum(giveawayCategories),
  condition: z.enum(giveawayConditions),
  quantity: z
    .string()
    .trim()
    .regex(/^\d+$/, "Use a whole number")
    .refine((value) => Number(value) >= 1 && Number(value) <= 100, {
      message: "Quantity must be between 1 and 100",
    }),
  country: z.string().trim().min(1).max(80),
  province: z.string().trim().min(1).max(80),
  city: z.string().trim().min(1).max(80),
  barangay: z.string().trim().max(120),
});

export const emptyGiveawayForm = Object.freeze({
  title: "",
  description: "",
  category: "other",
  condition: "good",
  quantity: "1",
  country: "Philippines",
  province: "",
  city: "",
  barangay: "",
});

export function giveawayFormToPayload(values) {
  return {
    title: values.title.trim(),
    description: values.description.trim(),
    category: values.category,
    condition: values.condition,
    quantity: Number(values.quantity),
    location: {
      country: values.country.trim(),
      province: values.province.trim(),
      city: values.city.trim(),
      barangay: values.barangay.trim() || null,
    },
  };
}
