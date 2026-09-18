import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useForm } from "react-hook-form";
import { Text, View } from "react-native";

import { AuthLink, AuthShell } from "../src/features/auth/AuthShell";
import { authApi } from "../src/features/auth/authApi";
import {
  ConsentField,
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import { registrationFormSchema } from "../src/features/auth/schemas";

export default function RegisterScreen() {
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(registrationFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      passwordConfirmation: "",
      termsAccepted: false,
      privacyAccepted: false,
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await authApi.register(values);
      router.replace({
        pathname: "/verify-email",
        params: { email: values.email },
      });
    } catch (error) {
      setError("root", { message: error.message });
    }
  });

  return (
    <AuthShell
      eyebrow="Join carefully"
      title="Create your account"
      description="Start with a verified email. Identity and partner verification come later and are never implied by registration."
      footer={
        <View>
          <Text className="text-center text-sm text-muted">
            Already have an account?
          </Text>
          <AuthLink href="/login">Sign in</AuthLink>
        </View>
      }
    >
      {errors.root ? <FormNotice>{errors.root.message}</FormNotice> : null}
      <View className="md:flex-row md:gap-4">
        <View className="flex-1">
          <FormField
            autoCapitalize="words"
            autoComplete="given-name"
            control={control}
            error={errors.firstName}
            label="First name"
            name="firstName"
            textContentType="givenName"
          />
        </View>
        <View className="flex-1">
          <FormField
            autoCapitalize="words"
            autoComplete="family-name"
            control={control}
            error={errors.lastName}
            label="Last name"
            name="lastName"
            textContentType="familyName"
          />
        </View>
      </View>
      <FormField
        autoComplete="email"
        control={control}
        error={errors.email}
        keyboardType="email-address"
        label="Email address"
        name="email"
        textContentType="emailAddress"
      />
      <FormField
        allowPasswordReveal
        autoComplete="new-password"
        control={control}
        error={errors.password}
        label="Password"
        name="password"
        secureTextEntry
        textContentType="newPassword"
      />
      <FormField
        allowPasswordReveal
        autoComplete="new-password"
        control={control}
        error={errors.passwordConfirmation}
        label="Confirm password"
        name="passwordConfirmation"
        secureTextEntry
        textContentType="newPassword"
      />
      <ConsentField
        control={control}
        error={errors.termsAccepted}
        label="I accept the SolveOne Terms of Use."
        name="termsAccepted"
      />
      <ConsentField
        control={control}
        error={errors.privacyAccepted}
        label="I have read and accept the Privacy Notice."
        name="privacyAccepted"
      />
      <View className="mt-3">
        <PrimaryButton loading={isSubmitting} onPress={onSubmit}>
          Create account
        </PrimaryButton>
      </View>
    </AuthShell>
  );
}
