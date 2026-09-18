import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { ResponsiveGrid } from "../src/components/ResponsiveGrid";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { missionApi } from "../src/features/missions/missionApi";
import { MissionCard } from "../src/features/missions/MissionPrimitives";
import { RequestNav } from "../src/features/requests/RequestPrimitives";

export default function CommunityMissionsScreen() {
  const { authenticatedRequest, isAuthenticated, user } = useAuth();
  const [matchedOnly, setMatchedOnly] = useState(false);
  const query = useInfiniteQuery({
    queryKey: ["community-missions", matchedOnly, user?.id ?? "public"],
    queryFn: ({ pageParam }) =>
      matchedOnly
        ? missionApi.matches(authenticatedRequest, {
            limit: 20,
            cursor: pageParam,
          })
        : missionApi.list({ limit: 20, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: !matchedOnly || isAuthenticated,
  });
  const missions = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PageContainer>
      <RequestNav
        action={
          isAuthenticated ? (
            <View className="flex-row flex-wrap gap-2">
              <Link href="/my-missions" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-12 justify-center rounded-xl border border-leaf px-4"
                >
                  <Text className="font-black text-leaf">My missions</Text>
                </Pressable>
              </Link>
              <Link href="/mission-create" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-12 justify-center rounded-xl bg-pine px-4"
                >
                  <Text className="font-black text-white">Propose mission</Text>
                </Pressable>
              </Link>
            </View>
          ) : null
        }
      />
      <View className="w-full">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Verified community action
        </Text>
        <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
          Solve one shared problem together.
        </Text>
        <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
          Missions are reviewed before publication. Volunteer against a specific
          resource, follow local permissions, and never enter private property
          or attempt unsafe work.
        </Text>
        <View className="mt-6 flex-row flex-wrap gap-2">
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: !matchedOnly }}
            className={`min-h-12 justify-center rounded-full border px-5 ${
              !matchedOnly ? "border-pine bg-mint" : "border-line bg-white"
            }`}
            onPress={() => setMatchedOnly(false)}
          >
            <Text className="font-black text-ink">All verified missions</Text>
          </Pressable>
          <Pressable
            accessibilityRole="radio"
            accessibilityState={{ checked: matchedOnly }}
            className={`min-h-12 justify-center rounded-full border px-5 ${
              matchedOnly ? "border-pine bg-mint" : "border-line bg-white"
            }`}
            disabled={!isAuthenticated}
            onPress={() => setMatchedOnly(true)}
          >
            <Text className="font-black text-ink">Match my profile</Text>
          </Pressable>
        </View>
        {!isAuthenticated ? (
          <Text className="mt-3 text-sm text-muted">
            Sign in and add skills or a province to use volunteer matching.
          </Text>
        ) : null}
        {query.error ? (
          <View className="mt-6">
            <FormNotice>{query.error.message}</FormNotice>
          </View>
        ) : null}
        {!query.isLoading && !missions.length ? (
          <View className="mt-8 rounded-3xl border border-line bg-surface p-8">
            <Text className="text-2xl font-black text-ink">
              No missions match this view yet
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              Verified community work will appear here without fabricated
              activity or urgency.
            </Text>
          </View>
        ) : null}
        <ResponsiveGrid className="mt-8">
          {missions.map((mission) => (
            <MissionCard key={mission.id} mission={mission} />
          ))}
        </ResponsiveGrid>
        {query.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            className="mx-auto mt-8 min-h-14 justify-center rounded-2xl border border-leaf px-7"
            onPress={() => query.fetchNextPage()}
          >
            <Text className="font-black text-leaf">Load more</Text>
          </Pressable>
        ) : null}
      </View>
    </PageContainer>
  );
}
