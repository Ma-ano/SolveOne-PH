import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useState } from "react";

import { AuthLink, AuthShell } from "../src/features/auth/AuthShell";
import { authApi } from "../src/features/auth/authApi";
import {
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import { emailFormSchema } from "../src/features/auth/schemas";

export default function ForgotPasswordScreen() {
  const [message, setMessage] = useState(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      const result = await authApi.forgotPassword(email);
      setMessage(result.message);
    } catch (error) {
      setError("root", { message: error.message });
    }
  });

  return (
    <AuthShell
      eyebrow="Account recovery"
      title="Reset your password"
      description="We’ll send instructions when the account is eligible. The response is deliberately the same whether an email is registered or not."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      {errors.root ? <FormNotice>{errors.root.message}</FormNotice> : null}
      {message ? <FormNotice tone="success">{message}</FormNotice> : null}
      <FormField
        autoComplete="email"
        control={control}
        error={errors.email}
        keyboardType="email-address"
        label="Email address"
        name="email"
        textContentType="emailAddress"
      />
      <PrimaryButton loading={isSubmitting} onPress={onSubmit}>
        Send reset instructions
      </PrimaryButton>
    </AuthShell>
  );
}
