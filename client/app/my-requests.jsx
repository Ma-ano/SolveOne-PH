import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ConfirmationDialog } from "../src/components/ConfirmationDialog";
import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { requestApi } from "../src/features/requests/requestApi";
import {
  RequestCard,
  RequestNav,
} from "../src/features/requests/RequestPrimitives";

export default function MyRequestsScreen() {
  const queryClient = useQueryClient();
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelPending, setCancelPending] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [cancelNotice, setCancelNotice] = useState("");
  const { authenticatedRequest, status } = useAuth();
  const requestsQuery = useInfiniteQuery({
    queryKey: ["my-requests"],
    queryFn: ({ pageParam }) =>
      requestApi.listMine(authenticatedRequest, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated",
  });
  const requests =
    requestsQuery.data?.pages.flatMap((page) => page.items) ?? [];

  function cancelRequest(item) {
    setCancelNotice("");
    setCancelError("");
    setCancelTarget(item);
  }

  async function confirmCancellation() {
    if (!cancelTarget || cancelPending) return;

    setCancelError("");
    setCancelPending(true);
    try {
      await requestApi.cancel(authenticatedRequest, cancelTarget.id);
      await queryClient.invalidateQueries({ queryKey: ["my-requests"] });
      setCancelTarget(null);
      setCancelNotice("Your request has been cancelled.");
    } catch (error) {
      setCancelError(error.message);
    } finally {
      setCancelPending(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to manage requests
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Drafts and moderator feedback are private to the request owner.
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
          <Link href="/request-editor" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl bg-pine px-4"
            >
              <Text className="text-sm font-black text-white">
                Create request
              </Text>
            </Pressable>
          </Link>
        }
      />
      <View className="mb-8 max-w-3xl">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Owner workspace
        </Text>
        <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
          Your help requests
        </Text>
        <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
          Save privately, submit for review, and respond to specific moderator
          feedback.
        </Text>
      </View>

      {requestsQuery.error ? (
        <FormNotice>{requestsQuery.error.message}</FormNotice>
      ) : null}
      {cancelNotice ? (
        <FormNotice tone="success">{cancelNotice}</FormNotice>
      ) : null}
      {requestsQuery.isLoading ? (
        <Text className="py-12 text-center font-semibold text-muted">
          Loading your requests…
        </Text>
      ) : null}
      {!requestsQuery.isLoading && !requests.length ? (
        <View className="rounded-3xl border border-line bg-surface p-8">
          <Text className="text-2xl font-black text-ink">
            Start with one clear problem
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Your first draft stays private until you submit it and a moderator
            approves it.
          </Text>
        </View>
      ) : null}
      <View className="gap-4">
        {requests.map((item) => (
          <View key={item.id}>
            <RequestCard manage request={item} />
            {["published", "partially_solved", "cancelled"].includes(
              item.status,
            ) ? (
              <Link
                href={{
                  pathname: "/request-offers",
                  params: { requestId: item.id },
                }}
                asChild
              >
                <Pressable
                  accessibilityRole="link"
                  className="mt-2 min-h-12 justify-center self-end px-3"
                >
                  <Text className="text-sm font-bold text-leaf">
                    Review offers
                  </Text>
                </Pressable>
              </Link>
            ) : null}
            {!["solved", "cancelled", "rejected", "expired"].includes(
              item.status,
            ) ? (
              <Pressable
                accessibilityRole="button"
                className="mt-2 min-h-12 justify-center self-end px-3"
                onPress={() => cancelRequest(item)}
              >
                <Text className="text-sm font-bold text-coral">
                  Cancel request
                </Text>
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>
      {requestsQuery.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          className="mx-auto mt-8 min-h-14 justify-center rounded-2xl border border-leaf px-7"
          onPress={() => requestsQuery.fetchNextPage()}
        >
          <Text className="font-black text-leaf">Load more</Text>
        </Pressable>
      ) : null}
      <ConfirmationDialog
        cancelLabel="Keep request"
        confirmLabel="Cancel request"
        error={cancelError}
        message="This removes the request from active listings. A cancelled request cannot be reopened."
        onCancel={() => {
          setCancelError("");
          setCancelTarget(null);
        }}
        onConfirm={confirmCancellation}
        open={Boolean(cancelTarget)}
        pending={cancelPending}
        title="Cancel this request?"
      />
    </PageContainer>
  );
}
