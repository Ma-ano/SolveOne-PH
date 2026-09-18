import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useForm } from "react-hook-form";
import { Text, View } from "react-native";

import { AuthLink, AuthShell } from "../src/features/auth/AuthShell";
import {
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { loginFormSchema } from "../src/features/auth/schemas";

export default function LoginScreen() {
  const { login } = useAuth();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values);
      router.replace("/");
    } catch (error) {
      setError("root", { message: error.message });
    }
  });

  return (
    <AuthShell
      eyebrow="Welcome back"
      title="Sign in to help or ask"
      description="Your access token stays in memory. This device keeps only the rotating refresh credential in protected storage."
      footer={
        <View>
          <Text className="text-center text-sm text-muted">
            New to SolveOne?
          </Text>
          <AuthLink href="/register">Create an account</AuthLink>
        </View>
      }
    >
      {errors.root ? <FormNotice>{errors.root.message}</FormNotice> : null}
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
        autoComplete="current-password"
        control={control}
        error={errors.password}
        label="Password"
        name="password"
        secureTextEntry
        textContentType="password"
      />
      <View className="mb-4 items-end">
        <AuthLink href="/forgot-password">Forgot password?</AuthLink>
      </View>
      <PrimaryButton loading={isSubmitting} onPress={onSubmit}>
        Sign in
      </PrimaryButton>
    </AuthShell>
  );
}
