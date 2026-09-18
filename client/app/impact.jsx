import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { impactApi } from "../src/features/impact/impactApi";
import { RequestNav } from "../src/features/requests/RequestPrimitives";

function Metric({ value, label }) {
  return (
    <View className="min-w-40 flex-1 rounded-2xl border border-line bg-white p-5">
      <Text className="text-3xl font-black text-pine">{value}</Text>
      <Text className="mt-2 text-sm font-semibold text-muted">{label}</Text>
    </View>
  );
}

export default function ImpactScreen() {
  const { user } = useAuth();
  const platformQuery = useQuery({
    queryKey: ["platform-impact"],
    queryFn: impactApi.platform,
  });
  const userQuery = useQuery({
    queryKey: ["user-impact", user?.id],
    queryFn: () => impactApi.user(user.id),
    enabled: Boolean(user?.id),
  });
  const impact = userQuery.data?.impact;
  return (
    <PageContainer>
      <RequestNav />
      <View className="w-full">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Verified impact
        </Text>
        <Text className="mt-3 text-4xl font-black tracking-tight text-ink">
          Problems solved
        </Text>
        <Text className="mt-3 leading-7 text-muted">
          These numbers come from requester-confirmed assistance,
          two-party-confirmed free-item handoffs, creator-confirmed mission
          contributions, and fully solved requests or missions. Pending offers,
          reservations, pledges, unconfirmed work, and disputes are excluded.
        </Text>
        {platformQuery.error ? (
          <View className="mt-5">
            <FormNotice>{platformQuery.error.message}</FormNotice>
          </View>
        ) : null}
        <View className="mt-6 flex-row flex-wrap gap-3">
          <Metric
            label="Platform problems solved"
            value={platformQuery.data?.impact?.problemsSolved ?? "—"}
          />
        </View>
        {user?.id ? (
          <View className="mt-8 rounded-3xl border border-line bg-surface p-6">
            <Text className="text-2xl font-black text-ink">
              Your verified impact
            </Text>
            {userQuery.error ? (
              <View className="mt-4">
                <FormNotice>{userQuery.error.message}</FormNotice>
              </View>
            ) : null}
            <View className="mt-5 flex-row flex-wrap gap-3">
              <Metric
                label="Problems solved"
                value={impact?.problemsSolved ?? "—"}
              />
              <Metric
                label="Hours volunteered"
                value={impact?.hoursVolunteered ?? "—"}
              />
              <Metric
                label="Items donated"
                value={impact?.itemsDonated ?? "—"}
              />
              <Metric
                label="Skill-based assists"
                value={impact?.skillsProvided ?? "—"}
              />
            </View>
            <Text className="mt-5 text-sm leading-6 text-muted">
              Hours include only actual minutes submitted by helpers and
              confirmed by requesters.
            </Text>
          </View>
        ) : null}
      </View>
    </PageContainer>
  );
}
