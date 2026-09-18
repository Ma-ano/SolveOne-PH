import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { ResponsiveGrid } from "../src/components/ResponsiveGrid";
import { AuthLink } from "../src/features/auth/AuthShell";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { giveawayApi } from "../src/features/giveaways/giveawayApi";
import { GiveawayCard } from "../src/features/giveaways/GiveawayPrimitives";
import { RequestNav } from "../src/features/requests/RequestPrimitives";

export default function MyGiveawaysScreen() {
  const { authenticatedRequest, status } = useAuth();
  const query = useInfiniteQuery({
    queryKey: ["my-giveaways"],
    queryFn: ({ pageParam }) =>
      giveawayApi.listMine(authenticatedRequest, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated",
  });
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to manage your items
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
            <Link href="/giveaway-handoffs" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="font-black text-leaf">My handoffs</Text>
              </Pressable>
            </Link>
            <Link href="/giveaway-create" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl bg-pine px-4"
              >
                <Text className="font-black text-white">List an item</Text>
              </Pressable>
            </Link>
          </View>
        }
      />
      <View className="w-full">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Donor workspace
        </Text>
        <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
          Your free items
        </Text>
        <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
          Open an item to see category-matched needs. Active reservations must
          be cancelled or completed before a listing can be removed.
        </Text>
        {query.error ? (
          <View className="mt-6">
            <FormNotice>{query.error.message}</FormNotice>
          </View>
        ) : null}
        {!query.isLoading && !items.length ? (
          <View className="mt-6 rounded-3xl border border-line bg-surface p-8">
            <Text className="text-2xl font-black text-ink">
              You have not listed an item yet
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              A monitor, school uniform, book, charger, or mobility aid you no
              longer use may solve one concrete need.
            </Text>
          </View>
        ) : null}
        <ResponsiveGrid className="mt-6">
          {items.map((item) => (
            <GiveawayCard item={item} key={item.id} />
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
