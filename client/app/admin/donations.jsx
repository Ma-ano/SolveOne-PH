import { useQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../../src/components/PageContainer";
import { FormNotice } from "../../src/features/auth/FormControls";
import { useAuth } from "../../src/features/auth/AuthContext";
import { donationApi } from "../../src/features/donations/donationApi";
import {
  formatPesos,
  RequestNav,
} from "../../src/features/requests/RequestPrimitives";

function Metric({ label, value }) {
  return (
    <View className="min-w-44 flex-1 rounded-2xl border border-line bg-white p-5">
      <Text className="text-3xl font-black text-pine">{value}</Text>
      <Text className="mt-2 text-sm font-semibold text-muted">{label}</Text>
    </View>
  );
}

export default function DonationAdminScreen() {
  const { authenticatedRequest, status, user } = useAuth();
  const allowed = status === "authenticated" && user?.role === "admin";
  const dashboardQuery = useQuery({
    queryKey: ["admin-donation-dashboard"],
    queryFn: () => donationApi.dashboard(authenticatedRequest),
    enabled: allowed,
  });
  const data = dashboardQuery.data;
  return (
    <PageContainer>
      <RequestNav
        action={<Link href="/support-solveone">Donation history</Link>}
      />
      <View className="mx-auto w-full max-w-4xl gap-6">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest text-coral">
            Admin accounting view
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-3 text-4xl font-black text-ink"
          >
            Platform donations
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Webhook-confirmed platform support only. Test and live data never
            mix. These totals are operational records, not a substitute for
            provider settlement, tax, bank, refund, dispute, or audited
            accounting reports.
          </Text>
        </View>
        {!allowed ? (
          <FormNotice>Administrator access is required.</FormNotice>
        ) : null}
        {dashboardQuery.error ? (
          <FormNotice>{dashboardQuery.error.message}</FormNotice>
        ) : null}
        {data ? (
          <>
            <Text className="font-black uppercase tracking-wider text-leaf">
              {data.mode} mode · PHP
            </Text>
            <View className="flex-row flex-wrap gap-3">
              <Metric label="Confirmed donations" value={data.confirmed} />
              <Metric
                label="Gross confirmed"
                value={formatPesos(data.grossConfirmedCentavos)}
              />
              <Metric
                label="Refunded"
                value={formatPesos(data.refundedCentavos)}
              />
              <Metric
                label="After recorded refunds"
                value={formatPesos(data.netAfterRefundsCentavos)}
              />
              <Metric label="Pending checkouts" value={data.pending} />
              <Metric
                label="Deferred refund events"
                value={data.deferredRefunds}
              />
              <Metric
                label="Needs reconciliation"
                value={data.needsAttention}
              />
            </View>
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <Text className="text-2xl font-black text-ink">
                Recent records
              </Text>
              <Pressable
                accessibilityRole="button"
                className="min-h-12 justify-center"
                onPress={() => dashboardQuery.refetch()}
              >
                <Text className="font-bold text-leaf">Refresh</Text>
              </Pressable>
            </View>
            <View className="gap-3">
              {data.recent.map((item) => (
                <View
                  className="rounded-2xl border border-line bg-white p-5"
                  key={item.id}
                >
                  <Text className="font-black text-ink">
                    {formatPesos(item.amountCentavos)} · {item.status}
                  </Text>
                  <Text className="mt-2 text-sm text-muted">
                    {new Date(item.createdAt).toLocaleString("en-PH")} ·
                    internal ID {item.id}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </PageContainer>
  );
}
