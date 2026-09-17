import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { PageContainer } from "../../src/components/PageContainer";
import { AuthLink } from "../../src/features/auth/AuthShell";
import { FormNotice } from "../../src/features/auth/FormControls";
import { useAuth } from "../../src/features/auth/AuthContext";
import { requestApi } from "../../src/features/requests/requestApi";
import {
  formatPesos,
  formatRequestDate,
  humanize,
  NeedItemList,
  RequestNav,
  StatusBadge,
} from "../../src/features/requests/RequestPrimitives";

export default function RequestModerationScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status, user } = useAuth();
  const [notes, setNotes] = useState({});
  const [workingId, setWorkingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const canModerate = ["moderator", "admin"].includes(user?.role);
  const queueQuery = useInfiniteQuery({
    queryKey: ["moderation-requests", "pending_review"],
    queryFn: ({ pageParam }) =>
      requestApi.listForModeration(authenticatedRequest, {
        status: "pending_review",
        limit: 10,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated" && canModerate,
  });
  const requests = queueQuery.data?.pages.flatMap((page) => page.items) ?? [];

  async function moderate(item, action) {
    const reviewNotes = notes[item.id]?.trim() ?? "";
    if (action !== "approve" && reviewNotes.length < 10) {
      setActionError(
        "Rejection and change requests need at least 10 characters of specific feedback.",
      );
      return;
    }

    try {
      setActionError("");
      setWorkingId(item.id);
      await requestApi.moderate(
        authenticatedRequest,
        item.id,
        action,
        action === "approve" ? undefined : reviewNotes,
      );
      await queryClient.invalidateQueries({
        queryKey: ["moderation-requests"],
      });
      setNotes((current) => ({ ...current, [item.id]: "" }));
    } catch (error) {
      setActionError(error.message);
    } finally {
      setWorkingId(null);
    }
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Moderator sign-in required
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Request drafts and private locations are restricted review data.
          </Text>
          <View className="mt-5">
            <AuthLink href="/login">Continue to sign in</AuthLink>
          </View>
        </View>
      </PageContainer>
    );
  }

  if (!canModerate) {
    return (
      <PageContainer>
        <RequestNav />
        <FormNotice>You do not have permission to review requests.</FormNotice>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <RequestNav />
      <View className="mb-9 max-w-3xl">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Restricted moderation workspace
        </Text>
        <Text className="mt-3 text-4xl font-black tracking-tight text-ink md:text-5xl">
          Pending help requests
        </Text>
        <Text className="mt-4 text-base leading-7 text-muted">
          Review specificity, safety flags, value, location, and prohibited
          content. Approving publishes the sanitized request immediately.
        </Text>
      </View>

      {actionError ? <FormNotice>{actionError}</FormNotice> : null}
      {queueQuery.error ? (
        <FormNotice>{queueQuery.error.message}</FormNotice>
      ) : null}
      {queueQuery.isLoading ? (
        <Text className="py-12 text-center font-semibold text-muted">
          Loading review queue…
        </Text>
      ) : null}
      {!queueQuery.isLoading && !requests.length ? (
        <View className="rounded-3xl border border-line bg-surface p-8">
          <Text className="text-2xl font-black text-ink">Queue clear</Text>
          <Text className="mt-3 leading-7 text-muted">
            There are no requests awaiting review.
          </Text>
        </View>
      ) : null}

      <View className="gap-6">
        {requests.map((item) => (
          <View
            className="rounded-3xl border border-line bg-surface p-6 md:p-9"
            key={item.id}
          >
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-coral">
                {humanize(item.category)} · {humanize(item.urgency)}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <Text className="mt-4 text-3xl font-black tracking-tight text-ink">
              {item.title}
            </Text>
            <Text className="mt-4 text-base leading-7 text-muted">
              {item.description}
            </Text>

            <View className="mt-6 flex-row flex-wrap gap-x-8 gap-y-3 border-y border-line py-5">
              <Text className="font-bold text-ink">
                Owner: {item.owner?.displayName ?? item.ownerId}
              </Text>
              <Text className="font-semibold text-muted">
                Needed {formatRequestDate(item.neededBy)}
              </Text>
              <Text className="font-semibold text-muted">
                {formatPesos(item.estimatedValueCentavos)} total
              </Text>
              <Text className="font-semibold text-muted">
                Private location:{" "}
                {item.location?.barangay ? `${item.location.barangay}, ` : ""}
                {item.location?.city}, {item.location?.province}
              </Text>
            </View>

            {item.safetyFlags?.length ? (
              <View className="mt-5 rounded-2xl border border-coral bg-red-50 p-4">
                <Text className="font-black text-coral">
                  Automated review flags
                </Text>
                <Text className="mt-2 text-sm leading-6 text-coral">
                  {item.safetyFlags.map(humanize).join(" · ")}
                </Text>
                <Text className="mt-2 text-xs leading-5 text-coral">
                  Flags are screening aids, not autonomous moderation decisions.
                </Text>
              </View>
            ) : null}

            <Text className="mb-4 mt-7 text-xl font-black text-ink">
              Concrete need items
            </Text>
            <NeedItemList items={item.needItems} />

            <Text className="mb-2 mt-7 text-sm font-bold text-ink">
              Feedback for rejection or requested changes
            </Text>
            <TextInput
              accessibilityLabel={`Moderator notes for ${item.title}`}
              className="min-h-28 rounded-2xl border border-line bg-white px-4 py-4 text-base text-ink"
              multiline
              onChangeText={(value) =>
                setNotes((current) => ({ ...current, [item.id]: value }))
              }
              placeholder="Give the owner specific, actionable feedback."
              placeholderTextColor="#7D8A83"
              textAlignVertical="top"
              value={notes[item.id] ?? ""}
            />
            <View className="mt-4 flex-row flex-wrap gap-3">
              <Pressable
                accessibilityRole="button"
                className="min-h-14 justify-center rounded-2xl bg-pine px-5"
                disabled={workingId === item.id}
                onPress={() => moderate(item, "approve")}
              >
                <Text className="font-black text-white">Approve</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="min-h-14 justify-center rounded-2xl border border-leaf px-5"
                disabled={workingId === item.id}
                onPress={() => moderate(item, "requestChanges")}
              >
                <Text className="font-black text-leaf">Request changes</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="min-h-14 justify-center rounded-2xl border border-coral px-5"
                disabled={workingId === item.id}
                onPress={() => moderate(item, "reject")}
              >
                <Text className="font-black text-coral">Reject</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      {queueQuery.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          className="mx-auto mt-8 min-h-14 justify-center rounded-2xl border border-leaf px-7"
          onPress={() => queueQuery.fetchNextPage()}
        >
          <Text className="font-black text-leaf">Load more</Text>
        </Pressable>
      ) : null}
    </PageContainer>
  );
}
