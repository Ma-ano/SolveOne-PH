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
import { emailFormSchema } from "../src/features/auth/schemas";

export default function VerifyEmailScreen() {
  const params = useLocalSearchParams();
  const token = typeof params.token === "string" ? params.token : "";
  const initialEmail = typeof params.email === "string" ? params.email : "";
  const [verified, setVerified] = useState(false);
  const [message, setMessage] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(emailFormSchema),
    defaultValues: { email: initialEmail },
  });

  async function verify() {
    setIsVerifying(true);
    setVerifyError(null);

    try {
      await authApi.verifyEmail(token);
      setVerified(true);
    } catch (error) {
      setVerifyError(error.message);
    } finally {
      setIsVerifying(false);
    }
  }

  const resend = handleSubmit(async ({ email }) => {
    try {
      const result = await authApi.resendVerification(email);
      setMessage(result.message);
    } catch (error) {
      setError("root", { message: error.message });
    }
  });

  return (
    <AuthShell
      eyebrow="Email verification"
      title={
        verified
          ? "Email verified"
          : token
            ? "Finish verification"
            : "Check your inbox"
      }
      description={
        verified
          ? "Your account now has the EMAIL_VERIFIED badge. You can sign in."
          : token
            ? "Confirm this one-time link to activate sign-in for your account."
            : "We sent a one-time verification link after registration. It expires for your protection."
      }
      footer={<AuthLink href="/login">Continue to sign in</AuthLink>}
    >
      {verifyError ? <FormNotice>{verifyError}</FormNotice> : null}
      {verified ? (
        <FormNotice tone="success">Your email address is verified.</FormNotice>
      ) : null}
      {token && !verified ? (
        <PrimaryButton loading={isVerifying} onPress={verify}>
          Verify email
        </PrimaryButton>
      ) : null}

      {!token && !verified ? (
        <>
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
          <PrimaryButton loading={isSubmitting} onPress={resend}>
            Resend verification email
          </PrimaryButton>
        </>
      ) : null}
    </AuthShell>
  );
}
