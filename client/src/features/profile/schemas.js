import { z } from "zod";

export function parseSkills(value) {
  return value
    .split(",")
    .map((skill) => skill.trim())
    .filter(Boolean);
}

export const profileFormSchema = z
  .object({
    firstName: z.string().trim().min(1, "Enter your first name").max(50),
    lastName: z.string().trim().min(1, "Enter your last name").max(50),
    bio: z.string().trim().max(500, "Keep your bio within 500 characters"),
    skillsText: z.string().max(1000),
    country: z.string().trim().max(80),
    province: z.string().trim().max(80),
    city: z.string().trim().max(80),
    barangay: z.string().trim().max(120),
  })
  .superRefine((values, context) => {
    const skills = parseSkills(values.skillsText);

    if (skills.length > 15) {
      context.addIssue({
        code: "custom",
        path: ["skillsText"],
        message: "List at most 15 skills",
      });
    }

    const seen = new Set();
    skills.forEach((skill) => {
      if (skill.length > 50) {
        context.addIssue({
          code: "custom",
          path: ["skillsText"],
          message: "Each skill must be 50 characters or fewer",
        });
      }

      const key = skill.toLocaleLowerCase("en");
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["skillsText"],
          message: "List each skill only once",
        });
      }
      seen.add(key);
    });
  });

export function profileToFormValues(user) {
  return {
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    bio: user?.bio ?? "",
    skillsText: user?.skills?.join(", ") ?? "",
    country: user?.location?.country ?? "",
    province: user?.location?.province ?? "",
    city: user?.location?.city ?? "",
    barangay: user?.location?.barangay ?? "",
  };
}

export function formValuesToProfile(values) {
  const location = {
    country: values.country,
    province: values.province,
    city: values.city,
    barangay: values.barangay,
  };
  const hasLocation = Object.values(location).some(Boolean);

  return {
    firstName: values.firstName,
    lastName: values.lastName,
    bio: values.bio,
    skills: parseSkills(values.skillsText),
    location: hasLocation ? location : null,
  };
}

export const accountClosureFormSchema = z.object({
  password: z
    .string()
    .min(1, "Enter your current password")
    .max(128, "Password is too long"),
  confirmation: z.literal("CLOSE MY ACCOUNT", {
    error: "Type CLOSE MY ACCOUNT exactly",
  }),
  retentionAcknowledged: z.literal(true, {
    error: "Acknowledge the retention notice before continuing",
  }),
});
