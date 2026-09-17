import { zodResolver } from "@hookform/resolvers/zod";
import { useLocalSearchParams } from "expo-router";
import { useForm } from "react-hook-form";
import { useState } from "react";

import { AuthLink, AuthShell } from "../src/features/auth/AuthShell";
import { authApi } from "../src/features/auth/authApi";
import {
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import { resetPasswordFormSchema } from "../src/features/auth/schemas";

export default function ResetPasswordScreen() {
  const params = useLocalSearchParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [message, setMessage] = useState(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: "", passwordConfirmation: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!token) {
      setError("root", { message: "This password reset link is incomplete." });
      return;
    }

    try {
      const result = await authApi.resetPassword({ token, ...values });
      setMessage(result.message);
    } catch (error) {
      setError("root", { message: error.message });
    }
  });

  return (
    <AuthShell
      eyebrow="Secure recovery"
      title="Choose a new password"
      description="A successful reset signs out every existing session for this account."
      footer={<AuthLink href="/login">Back to sign in</AuthLink>}
    >
      {!token ? (
        <FormNotice>This reset link is missing its one-time token.</FormNotice>
      ) : null}
      {errors.root ? <FormNotice>{errors.root.message}</FormNotice> : null}
      {message ? <FormNotice tone="success">{message}</FormNotice> : null}
      {!message ? (
        <>
          <FormField
            autoComplete="new-password"
            control={control}
            error={errors.password}
            label="New password"
            name="password"
            secureTextEntry
            textContentType="newPassword"
          />
          <FormField
            autoComplete="new-password"
            control={control}
            error={errors.passwordConfirmation}
            label="Confirm new password"
            name="passwordConfirmation"
            secureTextEntry
            textContentType="newPassword"
          />
          <PrimaryButton
            disabled={!token}
            loading={isSubmitting}
            onPress={onSubmit}
          >
            Reset password
          </PrimaryButton>
        </>
      ) : null}
    </AuthShell>
  );
}
