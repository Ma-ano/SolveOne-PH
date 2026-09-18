import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import {
  FormField,
  FormNotice,
  PrimaryButton,
} from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { profileApi } from "../src/features/profile/profileApi";
import {
  InitialAvatar,
  ProfileNav,
  VerificationBadge,
} from "../src/features/profile/ProfilePrimitives";
import {
  formValuesToProfile,
  profileFormSchema,
  profileToFormValues,
} from "../src/features/profile/schemas";

const profileQueryKey = ["private-profile"];

export default function ProfileScreen() {
  const queryClient = useQueryClient();
  const [savedNotice, setSavedNotice] = useState("");
  const { authenticatedRequest, status, updateCurrentUser, user } = useAuth();
  const profileQuery = useQuery({
    queryKey: profileQueryKey,
    queryFn: () => profileApi.getPrivateProfile(authenticatedRequest),
    enabled: status === "authenticated",
  });
  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm({
    resolver: zodResolver(profileFormSchema),
    defaultValues: profileToFormValues(user),
  });

  useEffect(() => {
    if (profileQuery.data?.user) {
      reset(profileToFormValues(profileQuery.data.user));
    }
  }, [profileQuery.data, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setSavedNotice("");
    try {
      const result = await profileApi.updatePrivateProfile(
        authenticatedRequest,
        formValuesToProfile(values),
      );
      updateCurrentUser(result.user);
      queryClient.setQueryData(profileQueryKey, result);
      reset(profileToFormValues(result.user));
      setSavedNotice("Your profile has been saved successfully.");
    } catch (error) {
      setError("root", { message: error.message });
    }
  });

  if (status === "loading") {
    return (
      <PageContainer>
        <View className="flex-1 items-center justify-center py-24">
          <ActivityIndicator color="#18392B" size="large" />
          <Text className="mt-4 font-semibold text-muted">
            Restoring your profile…
          </Text>
        </View>
      </PageContainer>
    );
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <ProfileNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text
            accessibilityRole="header"
            className="text-3xl font-black text-ink"
          >
            Sign in to edit your profile
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Private details such as your email and barangay are available only
            to you.
          </Text>
          <View className="mt-5">
            <AuthLink href="/login">Continue to sign in</AuthLink>
          </View>
        </View>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <ProfileNav
        action={
          <Link
            href={{ pathname: "/public-profile", params: { userId: user.id } }}
            asChild
          >
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl px-3"
            >
              <Text className="text-sm font-bold text-leaf">
                View public profile
              </Text>
            </Pressable>
          </Link>
        }
      />
      <View className="w-full">
        <View className="mb-6 md:flex-row md:items-end md:justify-between">
          <View className="max-w-xl md:flex-row md:items-center md:gap-5">
            <View className="mb-4 md:mb-0">
              <InitialAvatar name={`${user.firstName} ${user.lastName}`} />
            </View>
            <View className="flex-1">
              <Text className="text-xs font-bold uppercase tracking-widest text-coral">
                Your private profile
              </Text>
              <Text
                accessibilityRole="header"
                className="mt-3 text-page-title font-black text-ink md:text-page-title-lg"
              >
                How you show up
              </Text>
              <Text className="mt-3 text-base leading-7 text-muted">
                Your barangay and email remain private. Public visitors see only
                your city, province, country, bio, skills, and factual
                verification badge.
              </Text>
            </View>
          </View>
          <View className="mt-4 md:mt-0">
            <VerificationBadge
              level={
                profileQuery.data?.user?.verificationLevel ??
                user.verificationLevel
              }
            />
          </View>
        </View>

        <View className="mb-6 flex-row flex-wrap gap-4">
          <Link href="/safety" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
            >
              <Text className="font-bold text-leaf">
                Safety and blocked users
              </Text>
            </Pressable>
          </Link>
          <Link href="/identity-verification" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
            >
              <Text className="font-bold text-leaf">
                Private identity review
              </Text>
            </Pressable>
          </Link>
          <Link href="/account-closure" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl border border-coral px-4"
            >
              <Text className="font-bold text-coral">Close account</Text>
            </Pressable>
          </Link>
          <Link href="/privacy-requests" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
            >
              <Text className="font-bold text-leaf">Privacy requests</Text>
            </Pressable>
          </Link>
          {["moderator", "admin"].includes(user.role) ? (
            <>
              <Link href="/admin/reports" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-12 justify-center rounded-xl border border-coral px-4"
                >
                  <Text className="font-bold text-coral">
                    Moderation reports
                  </Text>
                </Pressable>
              </Link>
              <Link href="/admin/missions" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-12 justify-center rounded-xl border border-coral px-4"
                >
                  <Text className="font-bold text-coral">
                    Mission verification
                  </Text>
                </Pressable>
              </Link>
              <Link href="/admin/verifications" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-12 justify-center rounded-xl border border-leaf px-4"
                >
                  <Text className="font-bold text-leaf">
                    Identity reviewer workspace
                  </Text>
                </Pressable>
              </Link>
            </>
          ) : null}
          {user.role === "admin" ? (
            <Link href="/admin/privacy-requests" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-coral px-4"
              >
                <Text className="font-bold text-coral">
                  Privacy request operations
                </Text>
              </Pressable>
            </Link>
          ) : null}
        </View>

        <View className="rounded-3xl border border-line bg-surface p-6 md:p-10">
          {profileQuery.isLoading ? (
            <FormNotice tone="success">Loading the latest profile…</FormNotice>
          ) : null}
          {profileQuery.error ? (
            <FormNotice>{profileQuery.error.message}</FormNotice>
          ) : null}
          {errors.root ? <FormNotice>{errors.root.message}</FormNotice> : null}
          {savedNotice ? (
            <FormNotice tone="success">{savedNotice}</FormNotice>
          ) : null}

          <View className="md:flex-row md:gap-4">
            <View className="flex-1">
              <FormField
                autoCapitalize="words"
                control={control}
                error={errors.firstName}
                label="First name"
                name="firstName"
              />
            </View>
            <View className="flex-1">
              <FormField
                autoCapitalize="words"
                control={control}
                error={errors.lastName}
                label="Last name"
                name="lastName"
              />
            </View>
          </View>
          <FormField
            control={control}
            error={errors.bio}
            label="Bio"
            multiline
            name="bio"
            numberOfLines={5}
            placeholder="Share how you prefer to help or what matters to you."
          />
          <FormField
            control={control}
            error={errors.skillsText}
            label="Skills"
            name="skillsText"
            placeholder="Tutoring, document formatting, basic repairs"
          />
          <Text className="-mt-3 mb-6 text-xs leading-5 text-muted">
            Separate up to 15 skills with commas.
          </Text>

          <View className="mb-5 border-t border-line pt-6">
            <Text className="text-lg font-black text-ink">Location</Text>
            <Text className="mt-1 text-sm leading-6 text-muted">
              Barangay helps future local matching but is excluded from the
              public profile.
            </Text>
          </View>
          <View className="md:flex-row md:gap-4">
            <View className="flex-1">
              <FormField
                autoCapitalize="words"
                control={control}
                error={errors.country}
                label="Country"
                name="country"
              />
            </View>
            <View className="flex-1">
              <FormField
                autoCapitalize="words"
                control={control}
                error={errors.province}
                label="Province"
                name="province"
              />
            </View>
          </View>
          <View className="md:flex-row md:gap-4">
            <View className="flex-1">
              <FormField
                autoCapitalize="words"
                control={control}
                error={errors.city}
                label="City or municipality"
                name="city"
              />
            </View>
            <View className="flex-1">
              <FormField
                autoCapitalize="words"
                control={control}
                error={errors.barangay}
                label="Barangay (private)"
                name="barangay"
              />
            </View>
          </View>
          <PrimaryButton
            disabled={!isDirty || profileQuery.isLoading}
            loading={isSubmitting}
            onPress={onSubmit}
          >
            Save profile
          </PrimaryButton>
        </View>
      </View>
    </PageContainer>
  );
}
