import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { useAuth } from "../src/features/auth/AuthContext";
import { FormNotice } from "../src/features/auth/FormControls";
import { missionApi } from "../src/features/missions/missionApi";
import { MissionCard } from "../src/features/missions/MissionPrimitives";
import { RequestNav } from "../src/features/requests/RequestPrimitives";

export default function MyMissionsScreen() {
  const { authenticatedRequest, status } = useAuth();
  const query = useInfiniteQuery({
    queryKey: ["my-community-missions"],
    queryFn: ({ pageParam }) =>
      missionApi.mine(authenticatedRequest, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated",
  });
  const missions = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to manage missions
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
      <RequestNav
        action={
          <View className="flex-row flex-wrap gap-2">
            <Link href="/mission-contributions" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="font-black text-leaf">Contributions</Text>
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
        }
      />
      <View className="mx-auto w-full max-w-4xl">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Creator workspace
        </Text>
        <Text className="mt-3 text-4xl font-black text-ink">Your missions</Text>
        <Text className="mt-3 leading-7 text-muted">
          Drafts and evidence stay private. Published missions show only the
          moderated story, resource breakdown, and general location.
        </Text>
        {query.error ? (
          <View className="mt-6">
            <FormNotice>{query.error.message}</FormNotice>
          </View>
        ) : null}
        {!query.isLoading && !missions.length ? (
          <View className="mt-6 rounded-3xl border border-line bg-surface p-8">
            <Text className="text-2xl font-black text-ink">
              You have not proposed a mission yet
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              Start with one specific, permitted, safely supervised community
              problem.
            </Text>
          </View>
        ) : null}
        <View className="mt-6 gap-4">
          {missions.map((mission) => (
            <MissionCard key={mission.id} manage mission={mission} />
          ))}
        </View>
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
