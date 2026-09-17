import { z } from "zod";

const email = z.string().trim().email("Enter a valid email address").max(254);
const password = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(128, "Use no more than 128 characters");

function passwordsMatch(schema) {
  return schema.refine(
    (value) => value.password === value.passwordConfirmation,
    {
      path: ["passwordConfirmation"],
      message: "Passwords do not match",
    },
  );
}

export const loginFormSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password").max(128),
});

export const registrationFormSchema = passwordsMatch(
  z.object({
    firstName: z.string().trim().min(1, "Enter your first name").max(50),
    lastName: z.string().trim().min(1, "Enter your last name").max(50),
    email,
    password,
    passwordConfirmation: z.string().max(128),
    termsAccepted: z.boolean().refine(Boolean, "Accept the Terms to continue"),
    privacyAccepted: z
      .boolean()
      .refine(Boolean, "Accept the Privacy Notice to continue"),
  }),
);

export const emailFormSchema = z.object({ email });

export const resetPasswordFormSchema = passwordsMatch(
  z.object({
    password,
    passwordConfirmation: z.string().max(128),
  }),
);
