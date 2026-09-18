import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageContainer } from "../../src/components/PageContainer";
import { useAuth } from "../../src/features/auth/AuthContext";
import { FormNotice } from "../../src/features/auth/FormControls";
import { safetyApi } from "../../src/features/safety/safetyApi";

function Evidence({ evidence }) {
  if (!evidence) return null;
  return (
    <View className="mt-5 rounded-2xl bg-sand p-5">
      <Text className="text-xs font-black uppercase tracking-wider text-coral">
        Reported {evidence.type} only
      </Text>
      {evidence.title ? (
        <Text className="mt-3 text-xl font-black text-ink">
          {evidence.title}
        </Text>
      ) : null}
      {evidence.displayName ? (
        <Text className="mt-3 text-xl font-black text-ink">
          {evidence.displayName}
        </Text>
      ) : null}
      {evidence.content || evidence.description || evidence.bio ? (
        <Text className="mt-3 leading-7 text-ink">
          {evidence.content || evidence.description || evidence.bio}
        </Text>
      ) : null}
      <Text className="mt-3 text-sm text-muted">
        Status:{" "}
        {evidence.status ?? (evidence.removed ? "removed" : "available")}
      </Text>
      {evidence.automatedFlags?.length ? (
        <Text className="mt-2 text-sm text-coral">
          Automated flags: {evidence.automatedFlags.join(", ")}
        </Text>
      ) : null}
    </View>
  );
}

export default function ReportModerationScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status, user } = useAuth();
  const [queueStatus, setQueueStatus] = useState("open");
  const [selectedId, setSelectedId] = useState(null);
  const [resolution, setResolution] = useState("");
  const [accountReason, setAccountReason] = useState("");
  const canReview = ["moderator", "admin"].includes(user?.role);
  const queueQuery = useQuery({
    queryKey: ["moderation-reports", queueStatus],
    queryFn: () =>
      safetyApi.listReports(authenticatedRequest, { status: queueStatus }),
    enabled: status === "authenticated" && canReview,
  });
  const detailQuery = useQuery({
    queryKey: ["moderation-report", selectedId],
    queryFn: () => safetyApi.getReport(authenticatedRequest, selectedId),
    enabled: Boolean(selectedId),
    retry: false,
  });
  const claimMutation = useMutation({
    mutationFn: (reportId) =>
      safetyApi.claimReport(authenticatedRequest, reportId),
    onSuccess: (_, reportId) => {
      setResolution("");
      setAccountReason("");
      setSelectedId(reportId);
      queryClient.invalidateQueries({ queryKey: ["moderation-reports"] });
    },
  });
  const resolveMutation = useMutation({
    mutationFn: (outcome) =>
      safetyApi.resolveReport(authenticatedRequest, selectedId, {
        outcome,
        resolution: resolution.trim(),
      }),
    onSuccess: () => {
      setSelectedId(null);
      setResolution("");
      queryClient.invalidateQueries({ queryKey: ["moderation-reports"] });
    },
  });
  const accountMutation = useMutation({
    mutationFn: ({ userId, action }) =>
      action === "suspend"
        ? safetyApi.suspendUser(
            authenticatedRequest,
            userId,
            accountReason.trim(),
          )
        : safetyApi.reinstateUser(
            authenticatedRequest,
            userId,
            accountReason.trim(),
          ),
    onSuccess: () => {
      setAccountReason("");
      queryClient.invalidateQueries({
        queryKey: ["moderation-report", selectedId],
      });
    },
  });
  const detail = detailQuery.data;
  const error =
    queueQuery.error ||
    claimMutation.error ||
    detailQuery.error ||
    resolveMutation.error ||
    accountMutation.error;

  return (
    <PageContainer>
      <View className="w-full">
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <View>
            <Text
              accessibilityRole="header"
              className="text-page-title font-black text-ink md:text-page-title-lg"
            >
              Moderation reports
            </Text>
            <Text className="mt-2 max-w-2xl leading-7 text-muted">
              Claim a report before viewing its evidence. Message evidence is
              limited to the single reported message.
            </Text>
          </View>
          {user?.role === "admin" ? (
            <Link href="/admin/audit-logs" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="font-bold text-leaf">View audit logs</Text>
              </Pressable>
            </Link>
          ) : null}
        </View>

        {!canReview ? (
          <FormNotice>Moderator access is required.</FormNotice>
        ) : null}
        {error ? <FormNotice>{error.message}</FormNotice> : null}
        <View className="mt-6 flex-row flex-wrap gap-2">
          {["open", "reviewing"].map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              className={`min-h-12 justify-center rounded-xl px-4 ${
                queueStatus === value ? "bg-pine" : "border border-leaf"
              }`}
              onPress={() => {
                setQueueStatus(value);
                setSelectedId(null);
              }}
            >
              <Text
                className={
                  queueStatus === value
                    ? "font-bold text-white"
                    : "font-bold text-leaf"
                }
              >
                {value === "open" ? "Open" : "In review"}
              </Text>
            </Pressable>
          ))}
        </View>

        {queueQuery.isLoading ? (
          <ActivityIndicator className="mt-8" color="#18392B" />
        ) : null}
        <View className="mt-5 gap-3 md:flex-row md:flex-wrap">
          {queueQuery.data?.items?.map((report) => (
            <View
              key={report.id}
              className="rounded-2xl border border-line bg-surface p-5 md:w-[48%]"
            >
              <Text className="text-xs font-black uppercase tracking-wider text-coral">
                {report.targetType} · {report.status}
              </Text>
              <Text className="mt-2 text-lg font-black text-ink">
                {report.reason.replaceAll("_", " ")}
              </Text>
              <Text className="mt-2 text-sm text-muted">
                Submitted {new Date(report.createdAt).toLocaleString()}
              </Text>
              <Pressable
                accessibilityRole="button"
                className="mt-4 min-h-12 items-center justify-center rounded-xl bg-pine px-4"
                disabled={claimMutation.isPending}
                onPress={() => claimMutation.mutate(report.id)}
              >
                <Text className="font-black text-white">
                  {report.assignedToMe
                    ? "Reopen claimed report"
                    : "Claim and review"}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>

        {detail ? (
          <View className="mt-8 rounded-3xl border border-line bg-surface p-6 md:p-9">
            <Text className="text-2xl font-black text-ink">Claimed report</Text>
            <Text className="mt-3 font-bold text-coral">
              {detail.report.reason.replaceAll("_", " ")}
            </Text>
            {detail.report.description ? (
              <Text className="mt-3 leading-7 text-muted">
                {detail.report.description}
              </Text>
            ) : null}
            <Text className="mt-3 text-sm text-muted">
              Reported account:{" "}
              {detail.report.reportedUser?.displayName ?? "Unavailable"}
              {` · ${detail.report.reportedUser?.accountStatus ?? "unknown"}`}
            </Text>
            <Evidence evidence={detail.evidence} />

            {user?.role === "admin" && detail.report.reportedUser ? (
              <View className="mt-6 border-t border-line pt-5">
                <Text className="font-black text-ink">Account action</Text>
                <TextInput
                  accessibilityLabel="Account action reason"
                  className="mt-3 min-h-24 rounded-xl border border-line p-3 text-ink"
                  maxLength={1000}
                  multiline
                  onChangeText={setAccountReason}
                  placeholder="Document the safety reason (at least 10 characters)."
                  textAlignVertical="top"
                  value={accountReason}
                />
                <Pressable
                  accessibilityRole="button"
                  className="mt-3 min-h-12 items-center justify-center rounded-xl border border-coral px-4"
                  disabled={
                    accountReason.trim().length < 10 ||
                    accountMutation.isPending
                  }
                  onPress={() =>
                    accountMutation.mutate({
                      userId: detail.report.reportedUser.id,
                      action:
                        detail.report.reportedUser.accountStatus === "suspended"
                          ? "reinstate"
                          : "suspend",
                    })
                  }
                >
                  <Text className="font-black text-coral">
                    {detail.report.reportedUser.accountStatus === "suspended"
                      ? "Reinstate account"
                      : "Suspend account and revoke sessions"}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <View className="mt-6 border-t border-line pt-5">
              <Text className="font-black text-ink">Decision notes</Text>
              <TextInput
                accessibilityLabel="Moderation decision notes"
                className="mt-3 min-h-28 rounded-xl border border-line p-3 text-ink"
                maxLength={2000}
                multiline
                onChangeText={setResolution}
                placeholder="Record the evidence-based decision (at least 10 characters)."
                textAlignVertical="top"
                value={resolution}
              />
              <View className="mt-3 flex-row flex-wrap gap-2">
                <Pressable
                  accessibilityRole="button"
                  className="min-h-12 justify-center rounded-xl bg-pine px-4"
                  disabled={
                    resolution.trim().length < 10 || resolveMutation.isPending
                  }
                  onPress={() => resolveMutation.mutate("resolved")}
                >
                  <Text className="font-black text-white">Resolve report</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  className="min-h-12 justify-center rounded-xl border border-leaf px-4"
                  disabled={
                    resolution.trim().length < 10 || resolveMutation.isPending
                  }
                  onPress={() => resolveMutation.mutate("dismissed")}
                >
                  <Text className="font-black text-leaf">Dismiss report</Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </PageContainer>
  );
}
