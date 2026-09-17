import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { requestApi } from "../src/features/requests/requestApi";
import {
  RequestCard,
  RequestNav,
} from "../src/features/requests/RequestPrimitives";

export default function RequestsScreen() {
  const { isAuthenticated } = useAuth();
  const requestsQuery = useInfiniteQuery({
    queryKey: ["public-requests"],
    queryFn: ({ pageParam }) =>
      requestApi.listPublic({ limit: 12, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
  });
  const requests =
    requestsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PageContainer>
      <RequestNav
        action={
          <Link href={isAuthenticated ? "/my-requests" : "/login"} asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl bg-pine px-4"
            >
              <Text className="text-sm font-black text-white">
                {isAuthenticated ? "My requests" : "Sign in"}
              </Text>
            </Pressable>
          </Link>
        }
      />

      <View className="mb-10 max-w-3xl">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Discover practical needs
        </Text>
        <Text
          accessibilityRole="header"
          className="mt-3 text-4xl font-black tracking-tight text-ink md:text-6xl"
        >
          Small problems with a clear finish line.
        </Text>
        <Text className="mt-4 text-base leading-7 text-muted md:text-lg">
          Every request here has been reviewed. Exact addresses, private notes,
          and moderation details are not part of this public view.
        </Text>
        <Link href="/discover" asChild>
          <Pressable
            accessibilityRole="link"
            className="mt-5 min-h-14 items-center justify-center self-start rounded-2xl bg-leaf px-6"
          >
            <Text className="font-black text-white">Advanced matching</Text>
          </Pressable>
        </Link>
      </View>

      {requestsQuery.error ? (
        <FormNotice>{requestsQuery.error.message}</FormNotice>
      ) : null}
      {requestsQuery.isLoading ? (
        <Text className="py-12 text-center font-semibold text-muted">
          Loading reviewed requests…
        </Text>
      ) : null}
      {!requestsQuery.isLoading && !requests.length ? (
        <View className="rounded-3xl border border-line bg-surface p-8">
          <Text className="text-2xl font-black text-ink">
            No published requests yet
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            New requests appear only after a moderator approves them.
          </Text>
        </View>
      ) : null}
      <View className="gap-4">
        {requests.map((item) => (
          <RequestCard key={item.id} request={item} />
        ))}
      </View>
      {requestsQuery.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          className="mx-auto mt-8 min-h-14 items-center justify-center rounded-2xl border border-leaf px-7"
          disabled={requestsQuery.isFetchingNextPage}
          onPress={() => requestsQuery.fetchNextPage()}
        >
          <Text className="font-black text-leaf">
            {requestsQuery.isFetchingNextPage ? "Loading…" : "Load more"}
          </Text>
        </Pressable>
      ) : null}
    </PageContainer>
  );
}
