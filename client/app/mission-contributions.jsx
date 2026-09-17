import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { useAuth } from "../src/features/auth/AuthContext";
import { FormNotice } from "../src/features/auth/FormControls";
import {
  missionApi,
  missionOperationKey,
} from "../src/features/missions/missionApi";
import {
  humanize,
  RequestNav,
  StatusBadge,
} from "../src/features/requests/RequestPrimitives";

export default function MissionContributionsScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status, user } = useAuth();
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState({});
  const [minutes, setMinutes] = useState({});
  const query = useInfiniteQuery({
    queryKey: ["mission-contributions", user?.id],
    queryFn: ({ pageParam }) =>
      missionApi.contributions(authenticatedRequest, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated",
  });
  const contributions = query.data?.pages.flatMap((page) => page.items) ?? [];

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mission-contributions"] }),
      queryClient.invalidateQueries({ queryKey: ["community-mission"] }),
      queryClient.invalidateQueries({ queryKey: ["community-missions"] }),
      queryClient.invalidateQueries({ queryKey: ["my-community-missions"] }),
    ]);
  }

  async function transition(contribution, action) {
    setBusyId(contribution.id);
    setNotice("");
    try {
      await missionApi.transition(
        authenticatedRequest,
        contribution.id,
        action,
        ["accept", "confirm"].includes(action)
          ? missionOperationKey(`mission-${action}`, contribution.id)
          : undefined,
      );
      await refresh();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  async function complete(contribution) {
    const note = notes[contribution.id]?.trim() ?? "";
    if (note.length < 10) {
      setNotice("Completion notes need at least 10 characters.");
      return;
    }
    const actualMinutes = Number(minutes[contribution.id]);
    if (
      contribution.resourceType !== "item" &&
      (!Number.isInteger(actualMinutes) || actualMinutes < 1)
    ) {
      setNotice("Record the actual volunteer minutes.");
      return;
    }
    setBusyId(contribution.id);
    setNotice("");
    try {
      await missionApi.complete(
        authenticatedRequest,
        contribution.id,
        {
          note,
          ...(contribution.resourceType !== "item" ? { actualMinutes } : {}),
        },
        missionOperationKey("mission-complete", contribution.id),
      );
      await refresh();
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusyId(null);
    }
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to view contributions
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
          <Link href="/community-missions" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
            >
              <Text className="font-black text-leaf">Find missions</Text>
            </Pressable>
          </Link>
        }
      />
      <View className="mx-auto w-full max-w-4xl">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Participant workspace
        </Text>
        <Text className="mt-3 text-4xl font-black text-ink">
          Mission contributions
        </Text>
        <Text className="mt-3 leading-7 text-muted">
          Creators reserve resource capacity by accepting an offer. Contributors
          submit completion, and creators confirm only after the work or item is
          actually delivered.
        </Text>
        {notice ? (
          <View className="mt-6">
            <FormNotice>{notice}</FormNotice>
          </View>
        ) : null}
        {query.error ? (
          <View className="mt-6">
            <FormNotice>{query.error.message}</FormNotice>
          </View>
        ) : null}
        {!query.isLoading && !contributions.length ? (
          <View className="mt-6 rounded-3xl border border-line bg-surface p-8">
            <Text className="text-2xl font-black text-ink">
              No mission contributions yet
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              Your first concrete contribution can begin from a verified mission
              resource.
            </Text>
          </View>
        ) : null}
        <View className="mt-6 gap-5">
          {contributions.map((contribution) => {
            const isCreator = contribution.creatorId === user?.id;
            const person = isCreator
              ? contribution.contributor
              : contribution.creator;
            return (
              <View
                className="rounded-3xl border border-line bg-surface p-6"
                key={contribution.id}
              >
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <Text className="text-xs font-bold uppercase tracking-widest text-coral">
                    {isCreator ? "You coordinate" : "You contribute"}
                  </Text>
                  <StatusBadge status={contribution.status} />
                </View>
                <Text className="mt-4 text-2xl font-black text-ink">
                  {contribution.mission?.title ?? "Community mission"}
                </Text>
                <Text className="mt-2 font-bold text-leaf">
                  {contribution.mission?.resource?.name} · Qty{" "}
                  {contribution.quantity}
                </Text>
                <Text className="mt-3 leading-7 text-muted">
                  {contribution.message}
                </Text>
                <Text className="mt-3 text-sm font-semibold text-muted">
                  With {person?.displayName ?? "mission participant"}
                </Text>
                {contribution.completionNote ? (
                  <View className="mt-4 rounded-2xl bg-mint p-4">
                    <Text className="font-black text-pine">
                      Completion note
                    </Text>
                    <Text className="mt-2 leading-6 text-leaf">
                      {contribution.completionNote}
                    </Text>
                    {contribution.actualMinutes ? (
                      <Text className="mt-2 text-sm font-bold text-leaf">
                        {contribution.actualMinutes} actual minutes
                      </Text>
                    ) : null}
                  </View>
                ) : null}
                {!isCreator && contribution.status === "in_progress" ? (
                  <View className="mt-5">
                    <TextInput
                      accessibilityLabel="Completion note"
                      className="min-h-28 rounded-2xl border border-line bg-white p-4 text-ink"
                      multiline
                      onChangeText={(value) =>
                        setNotes((current) => ({
                          ...current,
                          [contribution.id]: value,
                        }))
                      }
                      placeholder="Describe what was delivered or completed."
                      textAlignVertical="top"
                      value={notes[contribution.id] ?? ""}
                    />
                    {contribution.resourceType !== "item" ? (
                      <TextInput
                        accessibilityLabel="Actual volunteer minutes"
                        className="mt-3 min-h-14 rounded-2xl border border-line bg-white px-4 text-ink"
                        keyboardType="number-pad"
                        onChangeText={(value) =>
                          setMinutes((current) => ({
                            ...current,
                            [contribution.id]: value,
                          }))
                        }
                        placeholder="Actual minutes"
                        value={minutes[contribution.id] ?? ""}
                      />
                    ) : null}
                  </View>
                ) : null}
                <View className="mt-5 flex-row flex-wrap gap-3">
                  {isCreator && contribution.status === "pending" ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        className="min-h-12 justify-center rounded-xl bg-pine px-4"
                        disabled={busyId === contribution.id}
                        onPress={() => transition(contribution, "accept")}
                      >
                        <Text className="font-black text-white">Accept</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        className="min-h-12 justify-center rounded-xl border border-coral px-4"
                        disabled={busyId === contribution.id}
                        onPress={() => transition(contribution, "reject")}
                      >
                        <Text className="font-black text-coral">Decline</Text>
                      </Pressable>
                    </>
                  ) : null}
                  {!isCreator && contribution.status === "pending" ? (
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-12 justify-center rounded-xl border border-coral px-4"
                      disabled={busyId === contribution.id}
                      onPress={() => transition(contribution, "withdraw")}
                    >
                      <Text className="font-black text-coral">Withdraw</Text>
                    </Pressable>
                  ) : null}
                  {!isCreator && contribution.status === "accepted" ? (
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-12 justify-center rounded-xl bg-pine px-4"
                      disabled={busyId === contribution.id}
                      onPress={() => transition(contribution, "start")}
                    >
                      <Text className="font-black text-white">Start work</Text>
                    </Pressable>
                  ) : null}
                  {!isCreator && contribution.status === "in_progress" ? (
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-12 justify-center rounded-xl bg-pine px-4"
                      disabled={busyId === contribution.id}
                      onPress={() => complete(contribution)}
                    >
                      <Text className="font-black text-white">
                        Submit completion
                      </Text>
                    </Pressable>
                  ) : null}
                  {isCreator &&
                  contribution.status === "completion_submitted" ? (
                    <Pressable
                      accessibilityRole="button"
                      className="min-h-12 justify-center rounded-xl bg-pine px-4"
                      disabled={busyId === contribution.id}
                      onPress={() => transition(contribution, "confirm")}
                    >
                      <Text className="font-black text-white">
                        Confirm delivered
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          })}
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
