import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { PageContainer } from "../../src/components/PageContainer";
import { AuthLink } from "../../src/features/auth/AuthShell";
import { useAuth } from "../../src/features/auth/AuthContext";
import { FormNotice } from "../../src/features/auth/FormControls";
import { missionApi } from "../../src/features/missions/missionApi";
import { MissionResourceList } from "../../src/features/missions/MissionPrimitives";
import {
  humanize,
  RequestNav,
  StatusBadge,
} from "../../src/features/requests/RequestPrimitives";

export default function MissionModerationScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status, user } = useAuth();
  const [notes, setNotes] = useState({});
  const [workingId, setWorkingId] = useState(null);
  const [actionError, setActionError] = useState("");
  const canModerate = ["moderator", "admin"].includes(user?.role);
  const query = useInfiniteQuery({
    queryKey: ["mission-moderation", "pending_review"],
    queryFn: ({ pageParam }) =>
      missionApi.moderationQueue(authenticatedRequest, {
        status: "pending_review",
        limit: 10,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated" && canModerate,
  });
  const missions = query.data?.pages.flatMap((page) => page.items) ?? [];

  async function moderate(mission, action) {
    const reviewNotes = notes[mission.id]?.trim() ?? "";
    if (action !== "approve" && reviewNotes.length < 10) {
      setActionError("Rejection and change requests need specific feedback.");
      return;
    }
    setWorkingId(mission.id);
    setActionError("");
    try {
      await missionApi.moderate(
        authenticatedRequest,
        mission.id,
        action,
        action === "approve" ? undefined : reviewNotes,
      );
      await queryClient.invalidateQueries({
        queryKey: ["mission-moderation"],
      });
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
        <FormNotice>You do not have permission to verify missions.</FormNotice>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <RequestNav />
      <View className="mb-9 max-w-3xl">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Restricted verification workspace
        </Text>
        <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
          Pending community missions
        </Text>
        <Text className="mt-4 leading-7 text-muted">
          Verify the community need, permission, privacy, safe scope, and
          realistic resource breakdown. Automated flags are review aids only.
        </Text>
      </View>
      {actionError ? <FormNotice>{actionError}</FormNotice> : null}
      {query.error ? <FormNotice>{query.error.message}</FormNotice> : null}
      {!query.isLoading && !missions.length ? (
        <View className="rounded-3xl border border-line bg-surface p-8">
          <Text className="text-2xl font-black text-ink">Queue clear</Text>
          <Text className="mt-3 leading-7 text-muted">
            There are no missions awaiting verification.
          </Text>
        </View>
      ) : null}
      <View className="gap-6">
        {missions.map((mission) => (
          <View
            className="rounded-3xl border border-line bg-surface p-6 md:p-9"
            key={mission.id}
          >
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-coral">
                {humanize(mission.category)}
              </Text>
              <StatusBadge status={mission.status} />
            </View>
            <Text className="mt-4 text-3xl font-black text-ink">
              {mission.title}
            </Text>
            <Text className="mt-4 leading-7 text-muted">
              {mission.description}
            </Text>
            <View className="mt-5 rounded-2xl bg-sand p-4">
              <Text className="font-black text-ink">
                Private evidence and site context
              </Text>
              <Text className="mt-2 leading-6 text-muted">
                {mission.evidence?.note}
              </Text>
              <Text className="mt-3 text-sm font-semibold text-muted">
                {mission.location?.barangay
                  ? `${mission.location.barangay}, `
                  : ""}
                {mission.location?.city}, {mission.location?.province}
              </Text>
            </View>
            {mission.safetyFlags?.length ? (
              <View className="mt-5 rounded-2xl border border-coral bg-red-50 p-4">
                <Text className="font-black text-coral">
                  Automated review flags
                </Text>
                <Text className="mt-2 text-sm text-coral">
                  {mission.safetyFlags.map(humanize).join(" · ")}
                </Text>
              </View>
            ) : null}
            <Text className="mb-4 mt-7 text-xl font-black text-ink">
              Resource breakdown
            </Text>
            <MissionResourceList resources={mission.requiredResources} />
            <TextInput
              accessibilityLabel={`Moderator notes for ${mission.title}`}
              className="mt-6 min-h-28 rounded-2xl border border-line bg-white p-4 text-ink"
              multiline
              onChangeText={(value) =>
                setNotes((current) => ({ ...current, [mission.id]: value }))
              }
              placeholder="Specific feedback for rejection or requested changes."
              textAlignVertical="top"
              value={notes[mission.id] ?? ""}
            />
            <View className="mt-4 flex-row flex-wrap gap-3">
              <Pressable
                accessibilityRole="button"
                className="min-h-14 justify-center rounded-2xl bg-pine px-5"
                disabled={workingId === mission.id}
                onPress={() => moderate(mission, "approve")}
              >
                <Text className="font-black text-white">
                  Verify and publish
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="min-h-14 justify-center rounded-2xl border border-leaf px-5"
                disabled={workingId === mission.id}
                onPress={() => moderate(mission, "requestChanges")}
              >
                <Text className="font-black text-leaf">Request changes</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                className="min-h-14 justify-center rounded-2xl border border-coral px-5"
                disabled={workingId === mission.id}
                onPress={() => moderate(mission, "reject")}
              >
                <Text className="font-black text-coral">Reject</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </PageContainer>
  );
}
