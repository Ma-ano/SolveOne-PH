import { useQuery } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { FormNotice } from "../src/features/auth/FormControls";
import { requestApi } from "../src/features/requests/requestApi";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  formatPesos,
  formatRequestDate,
  humanize,
  NeedItemList,
  RequestNav,
  StatusBadge,
} from "../src/features/requests/RequestPrimitives";
import { VerificationBadge } from "../src/features/profile/ProfilePrimitives";
import { SafetyActions } from "../src/features/safety/SafetyActions";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

export default function RequestDetailsScreen() {
  const { isAuthenticated, user } = useAuth();
  const params = useLocalSearchParams();
  const requestId =
    typeof params.requestId === "string" ? params.requestId : "";
  const validId = objectIdPattern.test(requestId);
  const detailsQuery = useQuery({
    queryKey: ["public-request", requestId],
    queryFn: () => requestApi.getPublic(requestId),
    enabled: validId,
  });
  const item = detailsQuery.data?.request;

  return (
    <PageContainer>
      <RequestNav
        action={
          isAuthenticated ? (
            <Link href="/my-offers" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="text-sm font-bold text-leaf">My offers</Text>
              </Pressable>
            </Link>
          ) : null
        }
      />
      {!validId ? (
        <FormNotice>This request link is incomplete or invalid.</FormNotice>
      ) : null}
      {detailsQuery.isLoading ? (
        <View className="items-center py-20">
          <ActivityIndicator color="#18392B" size="large" />
        </View>
      ) : null}
      {detailsQuery.error ? (
        <FormNotice>{detailsQuery.error.message}</FormNotice>
      ) : null}

      {item ? (
        <View className="w-full">
          <View className="rounded-3xl border border-line bg-surface p-7 md:p-12">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <Text className="text-xs font-bold uppercase tracking-widest text-coral">
                {humanize(item.category)}
              </Text>
              <StatusBadge status={item.status} />
            </View>
            <Text
              accessibilityRole="header"
              className="mt-3 text-page-title font-black text-ink md:text-page-title-lg"
            >
              {item.title}
            </Text>
            <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
              {item.description}
            </Text>

            <View className="mt-8 flex-row flex-wrap gap-3 border-y border-line py-6">
              <View className="min-w-40 flex-1">
                <Text className="text-xs font-bold uppercase tracking-wider text-muted">
                  Needed by
                </Text>
                <Text className="mt-2 font-black text-ink">
                  {formatRequestDate(item.neededBy)}
                </Text>
              </View>
              <View className="min-w-40 flex-1">
                <Text className="text-xs font-bold uppercase tracking-wider text-muted">
                  Public location
                </Text>
                <Text className="mt-2 font-black text-ink">
                  {item.publicLocation.city}, {item.publicLocation.province}
                </Text>
              </View>
              <View className="min-w-40 flex-1">
                <Text className="text-xs font-bold uppercase tracking-wider text-muted">
                  Estimated need
                </Text>
                <Text className="mt-2 font-black text-ink">
                  {formatPesos(item.estimatedValueCentavos)}
                </Text>
              </View>
            </View>

            <Text className="mt-8 text-xl font-black text-ink">
              What would solve it
            </Text>
            <View className="mt-4">
              <NeedItemList
                items={item.needItems}
                renderAction={(need) => {
                  const remaining =
                    need.type === "money"
                      ? need.remainingValueCentavos
                      : need.remainingQuantity;
                  if (
                    remaining <= 0 ||
                    item.status === "solved" ||
                    item.owner.id === user?.id
                  ) {
                    return null;
                  }
                  return (
                    <Link
                      href={{
                        pathname: "/offer-create",
                        params: { requestId: item.id, needItemId: need.id },
                      }}
                      asChild
                    >
                      <Pressable
                        accessibilityRole="link"
                        className="min-h-12 items-center justify-center rounded-xl bg-pine px-4"
                      >
                        <Text className="font-black text-white">
                          I can help with this
                        </Text>
                      </Pressable>
                    </Link>
                  );
                }}
              />
            </View>

            <View className="mt-9 rounded-2xl bg-mint p-5">
              <Text className="text-xs font-bold uppercase tracking-wider text-leaf">
                Request owner
              </Text>
              <Text className="mt-2 text-xl font-black text-pine">
                {item.owner.displayName}
              </Text>
              <View className="mt-3">
                <VerificationBadge level={item.owner.verificationLevel} />
              </View>
              <Link
                href={{
                  pathname: "/public-profile",
                  params: { userId: item.owner.id },
                }}
                asChild
              >
                <Pressable
                  accessibilityRole="link"
                  className="mt-4 min-h-12 justify-center self-start rounded-xl border border-leaf px-4"
                >
                  <Text className="font-bold text-leaf">
                    View public profile
                  </Text>
                </Pressable>
              </Link>
            </View>
            {item.owner.id !== user?.id ? (
              <SafetyActions targetType="request" targetId={item.id} />
            ) : null}
            <Text className="mt-6 text-xs leading-5 text-muted">
              Public request pages intentionally omit barangay, exact location,
              private evidence, moderator notes, and helper negotiations.
              Accepted commitments appear only as aggregate progress.
            </Text>
          </View>
        </View>
      ) : null}
    </PageContainer>
  );
}
