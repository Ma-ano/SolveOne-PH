import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { PageContainer } from "../../src/components/PageContainer";
import { useAuth } from "../../src/features/auth/AuthContext";
import { FormNotice } from "../../src/features/auth/FormControls";
import { safetyApi } from "../../src/features/safety/safetyApi";

export default function AuditLogScreen() {
  const { authenticatedRequest, status, user } = useAuth();
  const auditQuery = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => safetyApi.listAuditLogs(authenticatedRequest),
    enabled: status === "authenticated" && user?.role === "admin",
  });

  return (
    <PageContainer>
      <View className="mx-auto w-full max-w-4xl">
        <Link href="/admin/reports" asChild>
          <Pressable
            accessibilityRole="link"
            className="mb-6 min-h-12 justify-center self-start"
          >
            <Text className="font-bold text-leaf">← Back to reports</Text>
          </Pressable>
        </Link>
        <Text
          accessibilityRole="header"
          className="text-4xl font-black text-ink"
        >
          Privileged audit log
        </Text>
        <Text className="mt-3 max-w-2xl leading-7 text-muted">
          This admin-only view shows who performed each privileged action and
          when. IP hashes and internal metadata are intentionally omitted.
        </Text>
        {user?.role !== "admin" ? (
          <FormNotice>Administrator access is required.</FormNotice>
        ) : null}
        {auditQuery.isLoading ? (
          <ActivityIndicator className="mt-8" color="#18392B" />
        ) : null}
        {auditQuery.error ? (
          <FormNotice>{auditQuery.error.message}</FormNotice>
        ) : null}
        <View className="mt-8 gap-3">
          {auditQuery.data?.items?.map((entry) => (
            <View
              key={entry.id}
              className="rounded-2xl border border-line bg-surface p-5"
            >
              <Text className="font-black text-ink">
                {entry.action.replaceAll("_", " ")}
              </Text>
              <Text className="mt-2 text-sm text-muted">
                {entry.actor?.displayName ?? "Unavailable actor"} (
                {entry.actor?.role ?? "unknown"})
              </Text>
              <Text className="mt-1 text-sm text-muted">
                {entry.targetType} · {entry.targetId}
              </Text>
              <Text className="mt-1 text-xs text-muted">
                {new Date(entry.createdAt).toLocaleString()}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </PageContainer>
  );
}
