import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Alert, Pressable, Text, View } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";

import { PageContainer } from "../src/components/PageContainer";
import { ResponsiveGrid } from "../src/components/ResponsiveGrid";
import { AuthLink } from "../src/features/auth/AuthShell";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  createOfferOperationKey,
  offerApi,
} from "../src/features/offers/offerApi";
import { OfferCard } from "../src/features/offers/OfferPrimitives";
import { requestApi } from "../src/features/requests/requestApi";
import {
  NeedItemList,
  RequestNav,
  StatusBadge,
} from "../src/features/requests/RequestPrimitives";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

function DecisionButton({ label, primary, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-12 justify-center rounded-xl px-4 ${
        primary ? "bg-pine" : "border border-coral"
      }`}
      onPress={onPress}
    >
      <Text
        className={`text-sm font-black ${primary ? "text-white" : "text-coral"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function RequestOffersScreen() {
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { authenticatedRequest, status } = useAuth();
  const requestId =
    typeof params.requestId === "string" ? params.requestId : "";
  const validId = objectIdPattern.test(requestId);
  const requestQuery = useQuery({
    queryKey: ["owned-request", requestId],
    queryFn: () => requestApi.getMine(authenticatedRequest, requestId),
    enabled: status === "authenticated" && validId,
  });
  const offersQuery = useInfiniteQuery({
    queryKey: ["request-offers", requestId],
    queryFn: ({ pageParam }) =>
      offerApi.listForRequest(authenticatedRequest, requestId, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated" && validId,
  });
  const ownedRequest = requestQuery.data?.request;
  const offers = offersQuery.data?.pages.flatMap((page) => page.items) ?? [];

  async function decide(offer, operation) {
    try {
      await offerApi.transition(
        authenticatedRequest,
        offer.id,
        operation,
        operation === "accept"
          ? createOfferOperationKey(operation, offer.id)
          : undefined,
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["request-offers", requestId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["owned-request", requestId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["public-request", requestId],
        }),
        queryClient.invalidateQueries({ queryKey: ["my-requests"] }),
      ]);
    } catch (error) {
      Alert.alert("Offer could not be updated", error.message);
    }
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to review offers
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Only the request owner can view and decide its offers.
          </Text>
          <View className="mt-5">
            <AuthLink href="/login">Continue to sign in</AuthLink>
          </View>
        </View>
      </PageContainer>
    );
  }

  if (!validId) {
    return (
      <PageContainer>
        <RequestNav />
        <FormNotice>This request link is incomplete or invalid.</FormNotice>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <RequestNav />
      {requestQuery.error || offersQuery.error ? (
        <FormNotice>
          {requestQuery.error?.message ?? offersQuery.error?.message}
        </FormNotice>
      ) : null}
      {ownedRequest ? (
        <View className="mb-8 rounded-3xl border border-line bg-surface p-6 md:p-8">
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <Text className="text-xs font-bold uppercase tracking-widest text-coral">
              Owner offer inbox
            </Text>
            <StatusBadge status={ownedRequest.status} />
          </View>
          <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
            {ownedRequest.title}
          </Text>
          <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
            Accept only the concrete amount you need. An accepted offer reserves
            capacity; it does not count as solved until completion is confirmed.
          </Text>
          <View className="mt-6">
            <NeedItemList items={ownedRequest.needItems} />
          </View>
        </View>
      ) : null}

      {offersQuery.isLoading || requestQuery.isLoading ? (
        <Text className="py-12 text-center font-semibold text-muted">
          Loading offers…
        </Text>
      ) : null}
      {!offersQuery.isLoading && !offers.length && !offersQuery.error ? (
        <View className="rounded-3xl border border-line bg-surface p-8">
          <Text className="text-2xl font-black text-ink">No offers yet</Text>
          <Text className="mt-3 leading-7 text-muted">
            New offers will appear here without exposing private negotiations on
            the public request page.
          </Text>
        </View>
      ) : null}
      <ResponsiveGrid>
        {offers.map((offer) => (
          <OfferCard
            actions={
              offer.status === "pending" ? (
                <>
                  <DecisionButton
                    label="Accept offer"
                    onPress={() => decide(offer, "accept")}
                    primary
                  />
                  <DecisionButton
                    label="Reject offer"
                    onPress={() => decide(offer, "reject")}
                  />
                </>
              ) : ["accepted", "in_progress"].includes(offer.status) ? (
                <AuthLink href="/conversations">Open messages</AuthLink>
              ) : ["completion_submitted", "disputed", "completed"].includes(
                  offer.status,
                ) ? (
                <Link
                  href={{
                    pathname: "/offer-completion",
                    params: {
                      offerId: offer.id,
                      requestId,
                      helpType: offer.helpType,
                      perspective: "owner",
                      offerStatus: offer.status,
                    },
                  }}
                  asChild
                >
                  <Pressable
                    accessibilityRole="link"
                    className="min-h-12 justify-center rounded-xl border border-leaf px-4"
                  >
                    <Text className="text-sm font-black text-leaf">
                      Review completion
                    </Text>
                  </Pressable>
                </Link>
              ) : null
            }
            key={offer.id}
            offer={offer}
            perspective="owner"
          />
        ))}
      </ResponsiveGrid>
      {offersQuery.hasNextPage ? (
        <Pressable
          accessibilityRole="button"
          className="mx-auto mt-8 min-h-14 justify-center rounded-2xl border border-leaf px-7"
          onPress={() => offersQuery.fetchNextPage()}
        >
          <Text className="font-black text-leaf">Load more</Text>
        </Pressable>
      ) : null}
    </PageContainer>
  );
}
