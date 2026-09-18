import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { ResponsiveGrid } from "../src/components/ResponsiveGrid";
import { AuthLink } from "../src/features/auth/AuthShell";
import { useAuth } from "../src/features/auth/AuthContext";
import { FormNotice } from "../src/features/auth/FormControls";
import {
  ConversationCard,
  DigitalAlalayWarning,
} from "../src/features/messaging/MessagingPrimitives";
import { messagingApi } from "../src/features/messaging/messagingApi";
import { useRealtime } from "../src/features/messaging/RealtimeContext";
import { RequestNav } from "../src/features/requests/RequestPrimitives";

export default function ConversationsScreen() {
  const { authenticatedRequest, status } = useAuth();
  const realtime = useRealtime();
  const conversationsQuery = useInfiniteQuery({
    queryKey: ["conversations"],
    queryFn: ({ pageParam }) =>
      messagingApi.listConversations(authenticatedRequest, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated",
  });
  const conversations =
    conversationsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to see messages
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Conversations are private and available only after an offer is
            accepted.
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
          <Link href="/my-offers" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
            >
              <Text className="text-sm font-black text-leaf">My offers</Text>
            </Pressable>
          </Link>
        }
      />
      <View className="mb-7 max-w-3xl">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Private help coordination
        </Text>
        <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
          Messages
        </Text>
        <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
          Chats exist only for accepted help offers. Realtime is{" "}
          {realtime.status}; persisted messages remain available if it
          disconnects.
        </Text>
        <Pressable
          accessibilityRole="button"
          className="mt-4 min-h-12 justify-center self-start rounded-xl border border-leaf px-4"
          onPress={() => conversationsQuery.refetch()}
        >
          <Text className="text-sm font-black text-leaf">Refresh inbox</Text>
        </Pressable>
      </View>
      <DigitalAlalayWarning notice="Never share passwords, OTPs, PINs, CVVs, recovery codes, seed phrases, or private keys in any chat." />
      {conversationsQuery.error ? (
        <View className="mt-5">
          <FormNotice>{conversationsQuery.error.message}</FormNotice>
        </View>
      ) : null}
      {conversationsQuery.isLoading ? (
        <Text className="py-12 text-center font-semibold text-muted">
          Loading conversations…
        </Text>
      ) : null}
      {!conversationsQuery.isLoading && !conversations.length ? (
        <View className="mt-5 rounded-3xl border border-line bg-surface p-8">
          <Text className="text-2xl font-black text-ink">No messages yet</Text>
          <Text className="mt-3 leading-7 text-muted">
            When a request owner accepts an offer, a private conversation will
            appear here for those two participants.
          </Text>
        </View>
      ) : null}
      <ResponsiveGrid className="mt-5">
        {conversations.map((conversation) => (
          <ConversationCard conversation={conversation} key={conversation.id} />
        ))}
      </ResponsiveGrid>
      {conversationsQuery.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          className="mx-auto mt-8 min-h-14 justify-center rounded-2xl border border-leaf px-7"
          onPress={() => conversationsQuery.fetchNextPage()}
        >
          <Text className="font-black text-leaf">Load more</Text>
        </Pressable>
      ) : null}
    </PageContainer>
  );
}
