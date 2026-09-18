import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { useAuth } from "../src/features/auth/AuthContext";
import { FormNotice } from "../src/features/auth/FormControls";
import {
  notificationApi,
  notificationCopy,
  notificationDestination,
} from "../src/features/notifications/notificationApi";
import { RequestNav } from "../src/features/requests/RequestPrimitives";

function notificationTime(value) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export default function NotificationsScreen() {
  const { authenticatedRequest, status, user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const enabled = status === "authenticated";
  const listQuery = useInfiniteQuery({
    queryKey: ["notifications", user?.id, unreadOnly],
    queryFn: ({ pageParam }) =>
      notificationApi.list(authenticatedRequest, {
        limit: 20,
        cursor: pageParam,
        unreadOnly,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled,
  });
  const countQuery = useQuery({
    queryKey: ["notification-unread-count", user?.id],
    queryFn: () => notificationApi.unreadCount(authenticatedRequest),
    enabled,
  });
  const notifications =
    listQuery.data?.pages.flatMap((page) => page.items) ?? [];

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      queryClient.invalidateQueries({
        queryKey: ["notification-unread-count"],
      }),
    ]);
  }

  async function open(notification) {
    if (busyId) return;
    setBusyId(notification.id);
    setNotice("");
    try {
      if (!notification.readAt)
        await notificationApi.markRead(authenticatedRequest, notification.id);
      await refresh();
      router.push(notificationDestination(notification));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  async function markAllRead() {
    if (busyId) return;
    setBusyId("all");
    setNotice("");
    try {
      await notificationApi.markAllRead(authenticatedRequest);
      await refresh();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  if (!enabled) {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in for notifications
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Help and request updates are private to your account.
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
      <RequestNav />
      <View className="w-full">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Private account updates
        </Text>
        <Text className="mt-3 text-4xl font-black tracking-tight text-ink">
          Notifications
        </Text>
        <Text className="mt-3 leading-7 text-muted">
          {countQuery.data?.unreadCount ?? 0} unread. Updates are saved even
          when realtime disconnects; no push alerts are sent yet.
        </Text>
        <View className="mt-5 flex-row flex-wrap gap-3">
          <Pressable
            accessibilityRole="button"
            onPress={() => setUnreadOnly((current) => !current)}
            className="min-h-12 justify-center rounded-xl border border-leaf px-4"
          >
            <Text className="font-bold text-leaf">
              {unreadOnly ? "Show all" : "Unread only"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={Boolean(busyId)}
            onPress={markAllRead}
            className="min-h-12 justify-center rounded-xl border border-leaf px-4"
          >
            <Text className="font-bold text-leaf">Mark all read</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => refresh()}
            className="min-h-12 justify-center rounded-xl border border-leaf px-4"
          >
            <Text className="font-bold text-leaf">Refresh</Text>
          </Pressable>
        </View>
        {notice || listQuery.error || countQuery.error ? (
          <View className="mt-5">
            <FormNotice>
              {notice || listQuery.error?.message || countQuery.error?.message}
            </FormNotice>
          </View>
        ) : null}
        {listQuery.isLoading ? (
          <Text className="py-12 text-center font-semibold text-muted">
            Loading notifications…
          </Text>
        ) : null}
        {!listQuery.isLoading && !notifications.length ? (
          <View className="mt-6 rounded-3xl border border-line bg-surface p-8">
            <Text className="text-2xl font-black text-ink">
              {unreadOnly ? "All caught up" : "No notifications yet"}
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              New help, giveaway, completion, conversation, and request-review
              updates will appear here.
            </Text>
          </View>
        ) : null}
        <View className="mt-6 gap-3">
          {notifications.map((notification) => {
            const [title, description] = notificationCopy[
              notification.kind
            ] ?? ["Account update", "Open this update."];
            return (
              <Pressable
                key={notification.id}
                accessibilityRole="button"
                accessibilityLabel={`${notification.readAt ? "Read" : "Unread"}: ${title}`}
                disabled={Boolean(busyId)}
                onPress={() => open(notification)}
                className={`rounded-2xl border p-5 ${notification.readAt ? "border-line bg-surface" : "border-leaf bg-mint"}`}
              >
                <View className="flex-row flex-wrap justify-between gap-3">
                  <Text className="text-lg font-black text-ink">{title}</Text>
                  <Text className="text-xs font-bold text-muted">
                    {notificationTime(notification.createdAt)}
                  </Text>
                </View>
                <Text className="mt-2 leading-6 text-muted">{description}</Text>
                <Text className="mt-3 text-xs font-bold uppercase tracking-wider text-leaf">
                  {notification.readAt ? "Read" : "Unread"} · Open update
                </Text>
              </Pressable>
            );
          })}
        </View>
        {listQuery.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            disabled={listQuery.isFetchingNextPage}
            onPress={() => listQuery.fetchNextPage()}
            className="mx-auto mt-8 min-h-14 justify-center rounded-2xl border border-leaf px-7"
          >
            <Text className="font-black text-leaf">Load more</Text>
          </Pressable>
        ) : null}
      </View>
    </PageContainer>
  );
}
