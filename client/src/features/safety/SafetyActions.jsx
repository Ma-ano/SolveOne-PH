import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useAuth } from "../auth/AuthContext";
import { safetyApi } from "./safetyApi";

const reasons = Object.freeze({
  user: [
    "scam",
    "impersonation",
    "harassment",
    "unsafe_contact",
    "spam",
    "other",
  ],
  request: [
    "scam",
    "prohibited_content",
    "privacy_exposure",
    "dangerous_activity",
    "child_safety",
    "duplicate",
    "other",
  ],
  giveaway_item: [
    "scam",
    "prohibited_content",
    "privacy_exposure",
    "dangerous_activity",
    "child_safety",
    "duplicate",
    "other",
  ],
  community_mission: [
    "scam",
    "prohibited_content",
    "privacy_exposure",
    "dangerous_activity",
    "child_safety",
    "duplicate",
    "other",
  ],
});

function label(value) {
  return value.replaceAll("_", " ");
}

export function SafetyActions({
  targetType,
  targetId,
  allowBlock = false,
  blockUserId = targetId,
}) {
  const { authenticatedRequest, isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("other");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState("");
  const reportMutation = useMutation({
    mutationFn: () =>
      targetType === "user"
        ? safetyApi.reportUser(authenticatedRequest, targetId, {
            reason,
            ...(description.trim() ? { description: description.trim() } : {}),
          })
        : targetType === "giveaway_item"
          ? safetyApi.reportGiveaway(authenticatedRequest, targetId, {
              reason,
              ...(description.trim()
                ? { description: description.trim() }
                : {}),
            })
          : targetType === "community_mission"
            ? safetyApi.reportMission(authenticatedRequest, targetId, {
                reason,
                ...(description.trim()
                  ? { description: description.trim() }
                  : {}),
              })
            : safetyApi.reportRequest(authenticatedRequest, targetId, {
                reason,
                ...(description.trim()
                  ? { description: description.trim() }
                  : {}),
              }),
    onSuccess: ({ duplicate }) => {
      setNotice(
        duplicate
          ? "Your open report is already in the moderation queue."
          : "Report sent to the moderation queue.",
      );
      setOpen(false);
      setDescription("");
    },
  });
  const blockMutation = useMutation({
    mutationFn: () => safetyApi.blockUser(authenticatedRequest, blockUserId),
    onSuccess: () =>
      setNotice(
        "User blocked. New offers and messages between your accounts are disabled.",
      ),
  });

  if (!isAuthenticated) {
    return (
      <Text className="mt-5 text-sm text-muted">
        Sign in to report unsafe content or block a user.
      </Text>
    );
  }

  return (
    <View className="mt-6 border-t border-line pt-5">
      <Text className="text-sm font-black text-ink">Safety controls</Text>
      <Text className="mt-1 text-sm leading-6 text-muted">
        Reports are private. Blocking is not disclosed to the other person.
      </Text>
      {notice ? (
        <Text
          accessibilityRole="alert"
          className="mt-3 text-sm font-bold text-leaf"
        >
          {notice}
        </Text>
      ) : null}
      {reportMutation.error || blockMutation.error ? (
        <Text accessibilityRole="alert" className="mt-3 text-sm text-coral">
          {(reportMutation.error || blockMutation.error).message}
        </Text>
      ) : null}
      <View className="mt-3 flex-row flex-wrap gap-2">
        <Pressable
          accessibilityRole="button"
          className="min-h-12 justify-center rounded-xl border border-coral px-4"
          onPress={() => setOpen((value) => !value)}
        >
          <Text className="font-bold text-coral">
            {open ? "Close report form" : `Report ${targetType}`}
          </Text>
        </Pressable>
        {allowBlock ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-12 justify-center rounded-xl border border-muted px-4"
            disabled={blockMutation.isPending}
            onPress={() => blockMutation.mutate()}
          >
            <Text className="font-bold text-muted">
              {blockMutation.isPending ? "Blocking…" : "Block user"}
            </Text>
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <View className="mt-4 rounded-2xl bg-sand p-4">
          <Text className="font-bold text-ink">What best describes this?</Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {reasons[targetType].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ checked: reason === value }}
                className={`min-h-11 justify-center rounded-xl border px-3 ${
                  reason === value
                    ? "border-leaf bg-mint"
                    : "border-line bg-white"
                }`}
                onPress={() => setReason(value)}
              >
                <Text className="font-semibold text-ink">{label(value)}</Text>
              </Pressable>
            ))}
          </View>
          <Text className="mb-2 mt-4 text-sm font-bold text-ink">
            Additional context (optional)
          </Text>
          <TextInput
            accessibilityLabel="Additional report context"
            className="min-h-28 rounded-xl border border-line bg-white p-3 text-ink"
            multiline
            maxLength={1000}
            onChangeText={setDescription}
            placeholder="Describe what happened without adding unrelated private information."
            textAlignVertical="top"
            value={description}
          />
          <Pressable
            accessibilityRole="button"
            className="mt-4 min-h-12 items-center justify-center rounded-xl bg-coral px-4"
            disabled={reportMutation.isPending}
            onPress={() => reportMutation.mutate()}
          >
            <Text className="font-black text-white">
              {reportMutation.isPending ? "Sending…" : "Send private report"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
