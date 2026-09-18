import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  missionApi,
  missionOperationKey,
} from "../src/features/missions/missionApi";
import { MissionResourceList } from "../src/features/missions/MissionPrimitives";
import { VerificationBadge } from "../src/features/profile/ProfilePrimitives";
import {
  humanize,
  RequestNav,
  StatusBadge,
} from "../src/features/requests/RequestPrimitives";
import { SafetyActions } from "../src/features/safety/SafetyActions";
import { apiRequest } from "../src/services/api/client";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

export default function MissionDetailsScreen() {
  const params = useLocalSearchParams();
  const missionId =
    typeof params.missionId === "string" ? params.missionId : "";
  const validId = objectIdPattern.test(missionId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { authenticatedRequest, isAuthenticated, status, user } = useAuth();
  const requester = isAuthenticated ? authenticatedRequest : apiRequest;
  const [selectedResource, setSelectedResource] = useState(null);
  const [message, setMessage] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [minutes, setMinutes] = useState("60");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["community-mission", missionId, user?.id ?? "public"],
    queryFn: () => missionApi.get(requester, missionId),
    enabled: validId && status !== "loading",
  });
  const mission = query.data?.mission;
  const creatorId = mission?.creatorId ?? mission?.creator?.id;
  const isOwner = Boolean(user?.id && creatorId === user.id);

  async function offer() {
    if (!selectedResource) {
      setNotice("Choose one open resource first.");
      return;
    }
    const parsedQuantity = Number(quantity);
    const parsedMinutes = Number(minutes);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setNotice("Quantity must be a whole number of at least 1.");
      return;
    }
    if (message.trim().length < 10) {
      setNotice("Explain how you can contribute in at least 10 characters.");
      return;
    }
    if (
      selectedResource.type !== "item" &&
      (!Number.isInteger(parsedMinutes) || parsedMinutes < 1)
    ) {
      setNotice("Add a realistic time estimate.");
      return;
    }
    setBusy(true);
    setNotice("");
    try {
      await missionApi.contribute(
        authenticatedRequest,
        missionId,
        {
          resourceId: selectedResource.id,
          message: message.trim(),
          quantity: parsedQuantity,
          ...(selectedResource.type !== "item"
            ? { estimatedMinutes: parsedMinutes }
            : {}),
        },
        missionOperationKey("mission-contribute", missionId),
      );
      await queryClient.invalidateQueries({
        queryKey: ["mission-contributions"],
      });
      router.push("/mission-contributions");
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    Alert.alert(
      "Cancel this mission?",
      "Pending contributions will close and accepted capacity will be released. A mission awaiting completion confirmation cannot be cancelled.",
      [
        { text: "Keep mission", style: "cancel" },
        {
          text: "Cancel mission",
          style: "destructive",
          onPress: async () => {
            try {
              await missionApi.cancel(authenticatedRequest, missionId);
              router.replace("/my-missions");
            } catch (error) {
              setNotice(error.message);
            }
          },
        },
      ],
    );
  }

  return (
    <PageContainer>
      <RequestNav
        action={
          isAuthenticated ? (
            <Link href="/mission-contributions" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="font-black text-leaf">My contributions</Text>
              </Pressable>
            </Link>
          ) : null
        }
      />
      {!validId ? <FormNotice>This mission link is invalid.</FormNotice> : null}
      {query.isLoading || status === "loading" ? (
        <View className="items-center py-20">
          <ActivityIndicator color="#18392B" size="large" />
        </View>
      ) : null}
      {query.error ? <FormNotice>{query.error.message}</FormNotice> : null}
      {notice ? <FormNotice>{notice}</FormNotice> : null}
      {mission ? (
        <View className="w-full">
          <View className="rounded-3xl border border-line bg-surface p-7 md:p-12">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-coral">
                {humanize(mission.category)}
              </Text>
              <StatusBadge status={mission.status} />
            </View>
            <Text className="mt-5 text-4xl font-black tracking-tight text-ink">
              {mission.title}
            </Text>
            <Text className="mt-5 text-base leading-8 text-muted">
              {mission.description}
            </Text>
            <View className="mt-6 flex-row flex-wrap gap-x-6 gap-y-3 border-y border-line py-5">
              <Text className="font-semibold text-muted">
                {mission.publicLocation?.city ?? mission.location?.city},{" "}
                {mission.publicLocation?.province ?? mission.location?.province}
              </Text>
              <Text className="font-bold text-leaf">
                Human verification: {humanize(mission.verificationStatus)}
              </Text>
              {mission.creator ? (
                <View className="flex-row items-center gap-2">
                  <Text className="font-semibold text-ink">
                    {mission.creator.displayName}
                  </Text>
                  <VerificationBadge
                    level={mission.creator.verificationLevel}
                  />
                </View>
              ) : null}
            </View>
            {isOwner && mission.evidence?.note ? (
              <View className="mt-6 rounded-2xl bg-sand p-4">
                <Text className="font-black text-ink">
                  Private verification note
                </Text>
                <Text className="mt-2 leading-6 text-muted">
                  {mission.evidence.note}
                </Text>
              </View>
            ) : null}
            <Text className="mb-4 mt-8 text-2xl font-black text-ink">
              Resource breakdown
            </Text>
            <MissionResourceList
              resources={mission.requiredResources}
              renderAction={
                !isOwner && isAuthenticated
                  ? (resource) => (
                      <Pressable
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: selectedResource?.id === resource.id,
                        }}
                        className={`min-h-12 items-center justify-center rounded-xl border px-4 ${
                          selectedResource?.id === resource.id
                            ? "border-pine bg-mint"
                            : "border-leaf"
                        }`}
                        onPress={() => setSelectedResource(resource)}
                      >
                        <Text className="font-black text-leaf">
                          {selectedResource?.id === resource.id
                            ? "Selected"
                            : "Volunteer for this"}
                        </Text>
                      </Pressable>
                    )
                  : undefined
              }
            />
            {!isOwner && selectedResource ? (
              <View className="mt-6 rounded-3xl border border-line bg-sand p-5">
                <Text className="text-xl font-black text-ink">
                  Offer a concrete contribution
                </Text>
                <TextInput
                  accessibilityLabel="Contribution message"
                  className="mt-4 min-h-28 rounded-2xl border border-line bg-white p-4 text-base text-ink"
                  multiline
                  onChangeText={setMessage}
                  placeholder="Explain what you can bring or do safely."
                  textAlignVertical="top"
                  value={message}
                />
                <TextInput
                  accessibilityLabel="Contribution quantity"
                  className="mt-3 min-h-14 rounded-2xl border border-line bg-white px-4 text-ink"
                  keyboardType="number-pad"
                  onChangeText={setQuantity}
                  placeholder="Quantity"
                  value={quantity}
                />
                {selectedResource.type !== "item" ? (
                  <TextInput
                    accessibilityLabel="Estimated minutes"
                    className="mt-3 min-h-14 rounded-2xl border border-line bg-white px-4 text-ink"
                    keyboardType="number-pad"
                    onChangeText={setMinutes}
                    placeholder="Estimated minutes"
                    value={minutes}
                  />
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  className="mt-4 min-h-14 items-center justify-center rounded-2xl bg-pine px-5"
                  disabled={busy}
                  onPress={offer}
                >
                  <Text className="font-black text-white">
                    {busy ? "Sending…" : "Send volunteer offer"}
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {!isAuthenticated ? (
              <Text className="mt-6 text-sm text-muted">
                Sign in to volunteer for a specific resource.
              </Text>
            ) : null}
            {isOwner ? (
              <View className="mt-7 flex-row flex-wrap gap-3">
                {["draft", "changes_requested"].includes(mission.status) ? (
                  <Link
                    href={{
                      pathname: "/mission-create",
                      params: { missionId },
                    }}
                    asChild
                  >
                    <Pressable
                      accessibilityRole="link"
                      className="min-h-12 justify-center rounded-xl border border-leaf px-4"
                    >
                      <Text className="font-black text-leaf">
                        Revise mission
                      </Text>
                    </Pressable>
                  </Link>
                ) : null}
                {!["completed", "cancelled", "rejected"].includes(
                  mission.status,
                ) ? (
                  <Pressable
                    accessibilityRole="button"
                    className="min-h-12 justify-center rounded-xl border border-coral px-4"
                    onPress={cancel}
                  >
                    <Text className="font-black text-coral">
                      Cancel mission
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : (
              <SafetyActions
                allowBlock
                blockUserId={creatorId}
                targetId={mission.id}
                targetType="community_mission"
              />
            )}
          </View>
        </View>
      ) : null}
    </PageContainer>
  );
}
