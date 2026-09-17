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
import { privacyApi } from "../../src/features/privacy/privacyApi";

const statuses = ["submitted", "in_review", "completed", "denied", "cancelled"];

function readable(value) {
  return value.replaceAll("_", " ");
}

function ChecklistItem({ checked, children, onPress }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      className="min-h-12 flex-row items-center"
      onPress={onPress}
    >
      <View
        className={`mr-3 h-6 w-6 items-center justify-center rounded-md border ${
          checked ? "border-leaf bg-leaf" : "border-line bg-white"
        }`}
      >
        {checked ? <Text className="font-black text-white">✓</Text> : null}
      </View>
      <Text className="flex-1 text-sm leading-6 text-ink">{children}</Text>
    </Pressable>
  );
}

export default function AdminPrivacyRequestsScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status: authStatus, user } = useAuth();
  const [status, setStatus] = useState("submitted");
  const [selectedId, setSelectedId] = useState(null);
  const [resolutionSummary, setResolutionSummary] = useState("");
  const [checks, setChecks] = useState({
    identityVerified: false,
    scopeReviewed: false,
    retentionReviewed: false,
  });
  const enabled = authStatus === "authenticated" && user?.role === "admin";
  const listQuery = useQuery({
    queryKey: ["privacy-requests", "admin", status],
    queryFn: () => privacyApi.listAdmin(authenticatedRequest, { status }),
    enabled,
  });
  const detailQuery = useQuery({
    queryKey: ["privacy-requests", "admin-detail", selectedId],
    queryFn: () => privacyApi.getAdmin(authenticatedRequest, selectedId),
    enabled: enabled && Boolean(selectedId),
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["privacy-requests", "admin"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["privacy-requests", "admin-detail", selectedId],
      }),
    ]);
  };
  const claimMutation = useMutation({
    mutationFn: () => privacyApi.claim(authenticatedRequest, selectedId),
    onSuccess: refresh,
  });
  const releaseMutation = useMutation({
    mutationFn: () => privacyApi.release(authenticatedRequest, selectedId),
    onSuccess: refresh,
  });
  const resolveMutation = useMutation({
    mutationFn: (outcome) =>
      privacyApi.resolve(authenticatedRequest, selectedId, {
        outcome,
        resolutionSummary: resolutionSummary.trim(),
        ...checks,
      }),
    onSuccess: async () => {
      setResolutionSummary("");
      setChecks({
        identityVerified: false,
        scopeReviewed: false,
        retentionReviewed: false,
      });
      await refresh();
    },
  });
  const actionError =
    claimMutation.error || releaseMutation.error || resolveMutation.error;
  const detail = detailQuery.data?.request;
  const checklistComplete = Object.values(checks).every(Boolean);

  return (
    <PageContainer>
      <View className="mx-auto w-full max-w-5xl">
        <Link href="/profile" asChild>
          <Pressable
            accessibilityRole="link"
            className="mb-6 min-h-12 justify-center self-start"
          >
            <Text className="font-bold text-leaf">← Back to profile</Text>
          </Pressable>
        </Link>
        <Text
          accessibilityRole="header"
          className="text-4xl font-black text-ink"
        >
          Privacy request operations
        </Text>
        <Text className="mt-3 max-w-3xl leading-7 text-muted">
          Admin-only case handling. Verify the requester, review every affected
          system and retention duty, then provide an owner-visible outcome.
          Fulfillment actions remain manual and must follow the approved
          runbook.
        </Text>
        {user?.role !== "admin" ? (
          <FormNotice>Administrator access is required.</FormNotice>
        ) : null}
        {actionError ? <FormNotice>{actionError.message}</FormNotice> : null}

        <View className="mt-7 flex-row flex-wrap gap-2">
          {statuses.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityState={{ selected: status === value }}
              className={`min-h-12 justify-center rounded-xl border px-4 ${
                status === value
                  ? "border-pine bg-pine"
                  : "border-line bg-surface"
              }`}
              onPress={() => {
                setStatus(value);
                setSelectedId(null);
              }}
            >
              <Text
                className={`font-bold capitalize ${
                  status === value ? "text-white" : "text-ink"
                }`}
              >
                {readable(value)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View className="mt-7 gap-3 lg:flex-row">
          <View className="gap-3 lg:w-2/5">
            {listQuery.isLoading ? <ActivityIndicator color="#18392B" /> : null}
            {listQuery.error ? (
              <FormNotice>{listQuery.error.message}</FormNotice>
            ) : null}
            {listQuery.data?.items?.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                className={`rounded-2xl border p-5 ${
                  selectedId === item.id
                    ? "border-pine bg-mint"
                    : "border-line bg-surface"
                }`}
                onPress={() => setSelectedId(item.id)}
              >
                <Text className="font-black capitalize text-ink">
                  {readable(item.requestType)}
                </Text>
                <Text className="mt-2 text-sm text-muted">
                  {item.requester?.displayName ?? "Unavailable requester"}
                </Text>
                <Text className="mt-1 text-xs text-muted">
                  {new Date(item.createdAt).toLocaleString()}
                </Text>
              </Pressable>
            ))}
            {!listQuery.isLoading && !listQuery.data?.items?.length ? (
              <Text className="rounded-2xl border border-line bg-surface p-5 text-muted">
                No requests in this queue.
              </Text>
            ) : null}
          </View>

          <View className="min-h-72 flex-1 rounded-3xl border border-line bg-surface p-6 md:p-8">
            {!selectedId ? (
              <Text className="text-muted">Select a case to review.</Text>
            ) : null}
            {detailQuery.isLoading ? (
              <ActivityIndicator color="#18392B" />
            ) : null}
            {detailQuery.error ? (
              <FormNotice>{detailQuery.error.message}</FormNotice>
            ) : null}
            {detail ? (
              <>
                <View className="flex-row flex-wrap items-start justify-between gap-3">
                  <View>
                    <Text className="text-xl font-black capitalize text-ink">
                      {readable(detail.requestType)}
                    </Text>
                    <Text className="mt-1 text-sm text-muted">
                      {detail.requester?.displayName} ·{" "}
                      {detail.requester?.email}
                    </Text>
                  </View>
                  <Text className="rounded-full bg-mint px-3 py-1 text-xs font-black uppercase text-pine">
                    {readable(detail.status)}
                  </Text>
                </View>
                <View className="mt-5 rounded-xl bg-canvas p-4">
                  <Text className="font-black text-ink">Requester details</Text>
                  <Text className="mt-2 leading-6 text-muted">
                    {detail.details}
                  </Text>
                </View>
                {detail.resolutionSummary ? (
                  <View className="mt-4 rounded-xl border border-line p-4">
                    <Text className="font-black text-ink">
                      Recorded outcome
                    </Text>
                    <Text className="mt-2 leading-6 text-muted">
                      {detail.resolutionSummary}
                    </Text>
                  </View>
                ) : null}

                {detail.status === "submitted" ? (
                  <Pressable
                    accessibilityRole="button"
                    className="mt-5 min-h-12 items-center justify-center rounded-xl bg-pine px-4"
                    disabled={claimMutation.isPending}
                    onPress={() => claimMutation.mutate()}
                  >
                    <Text className="font-black text-white">
                      Claim for review
                    </Text>
                  </Pressable>
                ) : null}

                {detail.status === "in_review" && detail.assignedToMe ? (
                  <View className="mt-6 border-t border-line pt-5">
                    <Text className="text-lg font-black text-ink">
                      Completion controls
                    </Text>
                    <ChecklistItem
                      checked={checks.identityVerified}
                      onPress={() =>
                        setChecks((value) => ({
                          ...value,
                          identityVerified: !value.identityVerified,
                        }))
                      }
                    >
                      Requester identity was verified using the approved
                      process.
                    </ChecklistItem>
                    <ChecklistItem
                      checked={checks.scopeReviewed}
                      onPress={() =>
                        setChecks((value) => ({
                          ...value,
                          scopeReviewed: !value.scopeReviewed,
                        }))
                      }
                    >
                      All affected collections, storage, providers, and backups
                      were reviewed.
                    </ChecklistItem>
                    <ChecklistItem
                      checked={checks.retentionReviewed}
                      onPress={() =>
                        setChecks((value) => ({
                          ...value,
                          retentionReviewed: !value.retentionReviewed,
                        }))
                      }
                    >
                      Retention, legal-hold, and third-party duties were
                      reviewed.
                    </ChecklistItem>
                    <Text className="mb-2 mt-4 text-sm font-bold text-ink">
                      Owner-visible outcome
                    </Text>
                    <TextInput
                      accessibilityLabel="Privacy request outcome"
                      className="min-h-32 rounded-xl border border-line p-4 text-ink"
                      maxLength={2000}
                      multiline
                      onChangeText={setResolutionSummary}
                      placeholder="Explain what was completed or why the request was denied (at least 20 characters)."
                      placeholderTextColor="#7D8A83"
                      textAlignVertical="top"
                      value={resolutionSummary}
                    />
                    <View className="mt-4 flex-row flex-wrap gap-2">
                      <Pressable
                        accessibilityRole="button"
                        className="min-h-12 justify-center rounded-xl bg-pine px-4"
                        disabled={
                          !checklistComplete ||
                          resolutionSummary.trim().length < 20 ||
                          resolveMutation.isPending
                        }
                        onPress={() => resolveMutation.mutate("completed")}
                      >
                        <Text className="font-black text-white">
                          Mark completed
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        className="min-h-12 justify-center rounded-xl border border-coral px-4"
                        disabled={
                          !checklistComplete ||
                          resolutionSummary.trim().length < 20 ||
                          resolveMutation.isPending
                        }
                        onPress={() => resolveMutation.mutate("denied")}
                      >
                        <Text className="font-black text-coral">
                          Deny with reason
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        className="min-h-12 justify-center rounded-xl border border-leaf px-4"
                        disabled={releaseMutation.isPending}
                        onPress={() => releaseMutation.mutate()}
                      >
                        <Text className="font-black text-leaf">
                          Release claim
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
                {detail.status === "in_review" && !detail.assignedToMe ? (
                  <FormNotice>
                    This case is assigned to another administrator.
                  </FormNotice>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </View>
    </PageContainer>
  );
}
