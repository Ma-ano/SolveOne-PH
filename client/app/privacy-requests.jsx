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

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { privacyApi } from "../src/features/privacy/privacyApi";

const requestTypes = [
  ["access", "Access my data"],
  ["rectification", "Correct my data"],
  ["erasure_or_blocking", "Erase or block data"],
  ["objection", "Object to processing"],
  ["portability", "Data portability"],
];

function readable(value) {
  return value.replaceAll("_", " ");
}

export default function PrivacyRequestsScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status } = useAuth();
  const [requestType, setRequestType] = useState("access");
  const [details, setDetails] = useState("");
  const [acknowledgement, setAcknowledgement] = useState(false);
  const [success, setSuccess] = useState("");
  const listQuery = useQuery({
    queryKey: ["privacy-requests", "own"],
    queryFn: () => privacyApi.listOwn(authenticatedRequest),
    enabled: status === "authenticated",
  });
  const submitMutation = useMutation({
    mutationFn: () =>
      privacyApi.submit(authenticatedRequest, {
        requestType,
        details: details.trim(),
        acknowledgement,
      }),
    onSuccess: async (result) => {
      setDetails("");
      setAcknowledgement(false);
      setSuccess(
        result.duplicate
          ? "You already have an active request of this type."
          : "Your privacy request was submitted.",
      );
      await queryClient.invalidateQueries({
        queryKey: ["privacy-requests", "own"],
      });
    },
  });
  const cancelMutation = useMutation({
    mutationFn: (requestId) =>
      privacyApi.cancel(authenticatedRequest, requestId),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["privacy-requests", "own"],
      }),
  });

  if (status === "loading") {
    return (
      <PageContainer>
        <ActivityIndicator className="mt-24" color="#18392B" size="large" />
      </PageContainer>
    );
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text
            accessibilityRole="header"
            className="text-3xl font-black text-ink"
          >
            Sign in to make a privacy request
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Requests are linked to your authenticated account so we can protect
            your information and show you its status.
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
      <View className="w-full">
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
          Your privacy requests
        </Text>
        <Text className="mt-3 max-w-2xl leading-7 text-muted">
          Ask to access, correct, erase or block, object to processing, or
          receive a portable copy of personal data connected to your account.
          Submitting a case does not automatically delete or export data.
        </Text>

        <View className="mt-8 rounded-3xl border border-line bg-surface p-6 md:p-8">
          <Text className="text-xl font-black text-ink">Create a request</Text>
          <Text className="mt-2 text-sm leading-6 text-muted">
            Choose the closest request type and explain which information or
            processing you mean. Do not include passwords, government ID
            numbers, or unrelated sensitive information.
          </Text>
          {success ? <FormNotice tone="success">{success}</FormNotice> : null}
          {submitMutation.error ? (
            <FormNotice>{submitMutation.error.message}</FormNotice>
          ) : null}
          <View className="mb-5 mt-5 flex-row flex-wrap gap-2">
            {requestTypes.map(([value, label]) => (
              <Pressable
                key={value}
                accessibilityRole="radio"
                accessibilityState={{ selected: requestType === value }}
                className={`min-h-12 justify-center rounded-xl border px-4 ${
                  requestType === value
                    ? "border-pine bg-pine"
                    : "border-line bg-white"
                }`}
                onPress={() => setRequestType(value)}
              >
                <Text
                  className={`font-bold ${
                    requestType === value ? "text-white" : "text-ink"
                  }`}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="mb-2 text-sm font-bold text-ink">
            Request details
          </Text>
          <TextInput
            accessibilityLabel="Privacy request details"
            className="min-h-36 rounded-2xl border border-line bg-white p-4 text-base text-ink"
            maxLength={2000}
            multiline
            onChangeText={setDetails}
            placeholder="Describe the data, correction, or processing involved (at least 20 characters)."
            placeholderTextColor="#7D8A83"
            textAlignVertical="top"
            value={details}
          />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: acknowledgement }}
            className="mt-4 min-h-12 flex-row items-center"
            onPress={() => setAcknowledgement((value) => !value)}
          >
            <View
              className={`mr-3 h-6 w-6 items-center justify-center rounded-md border ${
                acknowledgement ? "border-leaf bg-leaf" : "border-line bg-white"
              }`}
            >
              {acknowledgement ? (
                <Text className="font-black text-white">✓</Text>
              ) : null}
            </View>
            <Text className="flex-1 text-sm leading-6 text-ink">
              I understand SolveOne may verify my identity and review applicable
              retention duties before fulfilling this request.
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                details.trim().length < 20 ||
                !acknowledgement ||
                submitMutation.isPending,
            }}
            className={`mt-4 min-h-14 items-center justify-center rounded-2xl px-5 ${
              details.trim().length < 20 || !acknowledgement
                ? "bg-muted"
                : "bg-pine"
            }`}
            disabled={
              details.trim().length < 20 ||
              !acknowledgement ||
              submitMutation.isPending
            }
            onPress={() => {
              setSuccess("");
              submitMutation.mutate();
            }}
          >
            {submitMutation.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text className="font-black text-white">
                Submit privacy request
              </Text>
            )}
          </Pressable>
        </View>

        <Text className="mt-10 text-2xl font-black text-ink">Case history</Text>
        {listQuery.isLoading ? (
          <ActivityIndicator className="mt-6" color="#18392B" />
        ) : null}
        {listQuery.error ? (
          <FormNotice>{listQuery.error.message}</FormNotice>
        ) : null}
        {cancelMutation.error ? (
          <FormNotice>{cancelMutation.error.message}</FormNotice>
        ) : null}
        <View className="mt-5 gap-4">
          {listQuery.data?.items?.map((item) => (
            <View
              key={item.id}
              className="rounded-2xl border border-line bg-surface p-5"
            >
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text className="text-lg font-black capitalize text-ink">
                  {readable(item.requestType)}
                </Text>
                <Text className="rounded-full bg-mint px-3 py-1 text-xs font-black uppercase text-pine">
                  {readable(item.status)}
                </Text>
              </View>
              <Text className="mt-3 leading-6 text-muted">{item.details}</Text>
              {item.resolutionSummary ? (
                <View className="mt-4 rounded-xl bg-canvas p-4">
                  <Text className="font-black text-ink">Outcome</Text>
                  <Text className="mt-1 leading-6 text-muted">
                    {item.resolutionSummary}
                  </Text>
                </View>
              ) : null}
              <Text className="mt-3 text-xs text-muted">
                Submitted {new Date(item.createdAt).toLocaleString()}
              </Text>
              {item.status === "submitted" ? (
                <Pressable
                  accessibilityRole="button"
                  className="mt-4 min-h-12 justify-center self-start rounded-xl border border-coral px-4"
                  disabled={cancelMutation.isPending}
                  onPress={() => cancelMutation.mutate(item.id)}
                >
                  <Text className="font-bold text-coral">Cancel request</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
          {!listQuery.isLoading && !listQuery.data?.items?.length ? (
            <Text className="rounded-2xl border border-line bg-surface p-5 text-muted">
              You have not submitted a privacy request yet.
            </Text>
          ) : null}
        </View>
      </View>
    </PageContainer>
  );
}
