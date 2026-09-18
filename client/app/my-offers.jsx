import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { ResponsiveGrid } from "../src/components/ResponsiveGrid";
import { AuthLink } from "../src/features/auth/AuthShell";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { offerApi } from "../src/features/offers/offerApi";
import { OfferCard } from "../src/features/offers/OfferPrimitives";
import { RequestNav } from "../src/features/requests/RequestPrimitives";

function OfferAction({ label, tone = "primary", onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-12 justify-center rounded-xl px-4 ${
        tone === "primary" ? "bg-pine" : "border border-coral"
      }`}
      onPress={onPress}
    >
      <Text
        className={`text-sm font-black ${
          tone === "primary" ? "text-white" : "text-coral"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function MyOffersScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status } = useAuth();
  const offersQuery = useInfiniteQuery({
    queryKey: ["my-offers"],
    queryFn: ({ pageParam }) =>
      offerApi.listMine(authenticatedRequest, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated",
  });
  const offers = offersQuery.data?.pages.flatMap((page) => page.items) ?? [];

  async function transition(offer, operation) {
    try {
      await offerApi.transition(authenticatedRequest, offer.id, operation);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["my-offers"] }),
        queryClient.invalidateQueries({
          queryKey: ["request-offers", offer.requestId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["public-request", offer.requestId],
        }),
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
            Sign in to see your offers
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            Your offer details are visible only to you and each request owner.
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
      <RequestNav
        action={
          <Link href="/requests" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl bg-pine px-4"
            >
              <Text className="text-sm font-black text-white">
                Find a request
              </Text>
            </Pressable>
          </Link>
        }
      />
      <View className="mb-8 max-w-3xl">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Helper workspace
        </Text>
        <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
          Your help offers
        </Text>
        <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
          Withdraw a pending offer, start accepted assistance, then submit a
          private completion note for the requester to review.
        </Text>
      </View>

      {offersQuery.error ? (
        <FormNotice>{offersQuery.error.message}</FormNotice>
      ) : null}
      {offersQuery.isLoading ? (
        <Text className="py-12 text-center font-semibold text-muted">
          Loading your offers…
        </Text>
      ) : null}
      {!offersQuery.isLoading && !offers.length ? (
        <View className="rounded-3xl border border-line bg-surface p-8">
          <Text className="text-2xl font-black text-ink">No offers yet</Text>
          <Text className="mt-3 leading-7 text-muted">
            Open a published request and choose one concrete need you can help
            cover.
          </Text>
        </View>
      ) : null}
      <ResponsiveGrid>
        {offers.map((offer) => (
          <OfferCard
            actions={
              offer.status === "pending" ? (
                <OfferAction
                  label="Withdraw offer"
                  onPress={() => transition(offer, "withdraw")}
                  tone="danger"
                />
              ) : [
                  "accepted",
                  "in_progress",
                  "completion_submitted",
                  "disputed",
                ].includes(offer.status) ? (
                <>
                  <Link href="/conversations" asChild>
                    <Pressable
                      accessibilityRole="link"
                      className="min-h-12 justify-center rounded-xl border border-leaf px-4"
                    >
                      <Text className="text-sm font-black text-leaf">
                        Open messages
                      </Text>
                    </Pressable>
                  </Link>
                  {offer.status === "accepted" ? (
                    <OfferAction
                      label="Start assistance"
                      onPress={() => transition(offer, "start")}
                    />
                  ) : null}
                  {offer.status === "in_progress" ? (
                    <Link
                      href={{
                        pathname: "/offer-completion",
                        params: {
                          offerId: offer.id,
                          requestId: offer.requestId,
                          helpType: offer.helpType,
                          perspective: "helper",
                          offerStatus: offer.status,
                        },
                      }}
                      asChild
                    >
                      <Pressable
                        accessibilityRole="link"
                        className="min-h-12 justify-center rounded-xl bg-pine px-4"
                      >
                        <Text className="text-sm font-black text-white">
                          Submit completion
                        </Text>
                      </Pressable>
                    </Link>
                  ) : null}
                  {["completion_submitted", "disputed"].includes(
                    offer.status,
                  ) ? (
                    <Link
                      href={{
                        pathname: "/offer-completion",
                        params: {
                          offerId: offer.id,
                          requestId: offer.requestId,
                          helpType: offer.helpType,
                          perspective: "helper",
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
                          View evidence
                        </Text>
                      </Pressable>
                    </Link>
                  ) : null}
                </>
              ) : null
            }
            key={offer.id}
            offer={offer}
            perspective="helper"
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
