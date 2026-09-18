import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { profileApi } from "../src/features/profile/profileApi";
import {
  formatPublicLocation,
  InitialAvatar,
  ProfileNav,
  SkillChips,
  VerificationBadge,
} from "../src/features/profile/ProfilePrimitives";
import { SafetyActions } from "../src/features/safety/SafetyActions";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

export default function PublicProfileScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams();
  const userId = typeof params.userId === "string" ? params.userId : "";
  const validUserId = objectIdPattern.test(userId);
  const profileQuery = useQuery({
    queryKey: ["public-profile", userId],
    queryFn: () => profileApi.getPublicProfile(userId),
    enabled: validUserId,
  });
  const profile = profileQuery.data?.user;
  const location = formatPublicLocation(profile?.location);

  return (
    <PageContainer>
      <ProfileNav />
      <View className="w-full">
        {!validUserId ? (
          <FormNotice>
            This public profile link is incomplete or invalid.
          </FormNotice>
        ) : null}
        {profileQuery.isLoading ? (
          <View className="items-center py-20">
            <ActivityIndicator color="#18392B" size="large" />
          </View>
        ) : null}
        {profileQuery.error ? (
          <FormNotice>{profileQuery.error.message}</FormNotice>
        ) : null}

        {profile ? (
          <View className="rounded-3xl border border-line bg-surface p-7 md:p-12">
            <InitialAvatar name={profile.displayName} />
            <Text className="text-xs font-bold uppercase tracking-widest text-coral">
              Public profile
            </Text>
            <Text
              accessibilityRole="header"
              className="mt-3 text-4xl font-black tracking-tight text-ink md:text-5xl"
            >
              {profile.displayName}
            </Text>
            {location ? (
              <Text className="mt-3 text-base font-semibold text-muted">
                {location}
              </Text>
            ) : null}
            <View className="mt-5">
              <VerificationBadge level={profile.verificationLevel} />
            </View>

            <View className="mt-8 border-t border-line pt-7">
              <Text className="text-lg font-black text-ink">About</Text>
              <Text className="mt-3 text-base leading-7 text-muted">
                {profile.bio || "This person has not added a public bio yet."}
              </Text>
            </View>
            <View className="mt-8">
              <Text className="mb-4 text-lg font-black text-ink">
                Skills they can share
              </Text>
              <SkillChips skills={profile.skills} />
            </View>
            {profile.id !== user?.id ? (
              <SafetyActions
                allowBlock
                targetId={profile.id}
                targetType="user"
              />
            ) : null}
            <Text className="mt-9 border-t border-line pt-6 text-xs leading-5 text-muted">
              Public profiles intentionally exclude email, exact local address,
              account controls, trust internals, and private verification
              material.
            </Text>
          </View>
        ) : null}
      </View>
    </PageContainer>
  );
}
