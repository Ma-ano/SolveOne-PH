import { z } from "zod";

const optionalLocationValue = (maximum) =>
  z
    .string()
    .trim()
    .max(maximum)
    .transform((value) => value || null)
    .nullable()
    .optional();

const location = z
  .object({
    country: optionalLocationValue(80),
    province: optionalLocationValue(80),
    city: optionalLocationValue(80),
    barangay: optionalLocationValue(120),
  })
  .strict();

const skills = z
  .array(z.string().trim().min(1).max(50))
  .max(15)
  .superRefine((values, context) => {
    const seen = new Set();

    values.forEach((value, index) => {
      const key = value.toLocaleLowerCase("en");

      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: "Skills must be unique",
        });
      }

      seen.add(key);
    });
  });

export const updatePrivateProfileSchema = {
  body: z
    .object({
      firstName: z.string().trim().min(1).max(50).optional(),
      lastName: z.string().trim().min(1).max(50).optional(),
      bio: z
        .string()
        .trim()
        .max(500)
        .transform((value) => value || null)
        .nullable()
        .optional(),
      skills: skills.optional(),
      location: location.nullable().optional(),
    })
    .strict()
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one editable profile field is required",
    }),
};

export const publicProfileSchema = {
  params: z
    .object({
      userId: z.string().regex(/^[0-9a-fA-F]{24}$/, "User ID is invalid"),
    })
    .strict(),
};
