import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { useAuth } from "../src/features/auth/AuthContext";
import { FormNotice } from "../src/features/auth/FormControls";
import { safetyApi } from "../src/features/safety/safetyApi";

export default function SafetyScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status } = useAuth();
  const blocksQuery = useQuery({
    queryKey: ["blocked-users"],
    queryFn: () => safetyApi.listBlocks(authenticatedRequest),
    enabled: status === "authenticated",
  });
  const unblockMutation = useMutation({
    mutationFn: (userId) => safetyApi.unblockUser(authenticatedRequest, userId),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["blocked-users"] }),
  });

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
          Safety and blocked users
        </Text>
        <Text className="mt-3 max-w-2xl text-base leading-7 text-muted">
          Blocking quietly prevents new offers, messages, and live conversation
          access in either direction. It does not notify the other person.
        </Text>

        {status !== "authenticated" ? (
          <FormNotice>Sign in to manage your blocked users.</FormNotice>
        ) : null}
        {blocksQuery.isLoading ? (
          <ActivityIndicator className="mt-10" color="#18392B" size="large" />
        ) : null}
        {blocksQuery.error || unblockMutation.error ? (
          <FormNotice>
            {(blocksQuery.error || unblockMutation.error).message}
          </FormNotice>
        ) : null}

        <View className="mt-8 gap-3">
          {blocksQuery.data?.items?.map((block) => (
            <View
              key={block.id}
              className="rounded-2xl border border-line bg-surface p-5 md:flex-row md:items-center md:justify-between"
            >
              <View>
                <Text className="text-lg font-black text-ink">
                  {block.user?.displayName ?? "Unavailable account"}
                </Text>
                <Text className="mt-1 text-sm text-muted">
                  Blocked {new Date(block.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                className="mt-4 min-h-12 justify-center rounded-xl border border-leaf px-4 md:mt-0"
                disabled={unblockMutation.isPending}
                onPress={() => unblockMutation.mutate(block.user?.id)}
              >
                <Text className="font-bold text-leaf">Unblock</Text>
              </Pressable>
            </View>
          ))}
          {blocksQuery.data?.items?.length === 0 ? (
            <View className="rounded-2xl border border-line bg-surface p-6">
              <Text className="font-bold text-ink">No blocked users</Text>
              <Text className="mt-2 text-sm leading-6 text-muted">
                You can block someone from their public profile.
              </Text>
            </View>
          ) : null}
        </View>
      </View>
    </PageContainer>
  );
}
