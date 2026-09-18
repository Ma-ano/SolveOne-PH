import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  giveawayApi,
  giveawayOperationKey,
} from "../src/features/giveaways/giveawayApi";
import { HandoffCard } from "../src/features/giveaways/GiveawayPrimitives";
import { RequestNav } from "../src/features/requests/RequestPrimitives";

function Action({ children, danger = false, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      className={`min-h-12 justify-center rounded-xl px-4 ${
        danger ? "border border-coral" : "bg-pine"
      }`}
      onPress={onPress}
    >
      <Text className={`font-black ${danger ? "text-coral" : "text-white"}`}>
        {children}
      </Text>
    </Pressable>
  );
}

export default function GiveawayHandoffsScreen() {
  const queryClient = useQueryClient();
  const { authenticatedRequest, status, user } = useAuth();
  const query = useInfiniteQuery({
    queryKey: ["giveaway-handoffs", user?.id],
    queryFn: ({ pageParam }) =>
      giveawayApi.reservations(authenticatedRequest, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: status === "authenticated",
  });
  const reservations = query.data?.pages.flatMap((page) => page.items) ?? [];

  async function confirm(reservation) {
    try {
      await giveawayApi.confirm(
        authenticatedRequest,
        reservation.id,
        giveawayOperationKey("giveaway-confirm", reservation.id),
      );
      await refresh(reservation);
    } catch (error) {
      Alert.alert("Confirmation failed", error.message);
    }
  }

  function cancel(reservation) {
    Alert.alert(
      "Cancel this reservation?",
      "Reserved quantities will return to both the listing and request.",
      [
        { text: "Keep reservation", style: "cancel" },
        {
          text: "Cancel reservation",
          style: "destructive",
          onPress: async () => {
            try {
              await giveawayApi.cancel(authenticatedRequest, reservation.id);
              await refresh(reservation);
            } catch (error) {
              Alert.alert("Cancellation failed", error.message);
            }
          },
        },
      ],
    );
  }

  async function refresh(reservation) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["giveaway-handoffs"] }),
      queryClient.invalidateQueries({ queryKey: ["giveaway-items"] }),
      queryClient.invalidateQueries({
        queryKey: ["giveaway-item", reservation.itemId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["public-request", reservation.requestId],
      }),
      queryClient.invalidateQueries({ queryKey: ["platform-impact"] }),
      queryClient.invalidateQueries({ queryKey: ["user-impact"] }),
    ]);
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-lg rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to view handoffs
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
          <Link href="/my-giveaways" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
            >
              <Text className="font-black text-leaf">My items</Text>
            </Pressable>
          </Link>
        }
      />
      <View className="w-full">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Private handoffs
        </Text>
        <Text className="mt-3 text-page-title font-black text-ink md:text-page-title-lg">
          Confirm what actually changed hands.
        </Text>
        <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
          Confirm only after the physical item is handed over. Impact and
          request progress stay unchanged until donor and recipient both
          confirm. Meet in a safe public place.
        </Text>
        {query.error ? (
          <View className="mt-6">
            <FormNotice>{query.error.message}</FormNotice>
          </View>
        ) : null}
        {!query.isLoading && !reservations.length ? (
          <View className="mt-6 rounded-3xl border border-line bg-surface p-8">
            <Text className="text-2xl font-black text-ink">
              No handoffs yet
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              Reserve an available item for your published need, or wait for
              someone to reserve one of your listings.
            </Text>
          </View>
        ) : null}
        <View className="mt-6 gap-4">
          {reservations.map((reservation) => {
            const isDonor = reservation.donorId === user.id;
            const ownConfirmed = isDonor
              ? reservation.donorConfirmedAt
              : reservation.recipientConfirmedAt;
            const confirmationStarted = Boolean(
              reservation.donorConfirmedAt || reservation.recipientConfirmedAt,
            );
            return (
              <HandoffCard
                actions={
                  reservation.status === "reserved" ? (
                    <>
                      {!ownConfirmed ? (
                        <Action onPress={() => confirm(reservation)}>
                          Confirm handoff
                        </Action>
                      ) : null}
                      {!confirmationStarted ? (
                        <Action danger onPress={() => cancel(reservation)}>
                          Cancel reservation
                        </Action>
                      ) : null}
                    </>
                  ) : null
                }
                currentUserId={user.id}
                key={reservation.id}
                reservation={reservation}
              />
            );
          })}
        </View>
        {query.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            className="mx-auto mt-8 min-h-14 justify-center rounded-2xl border border-leaf px-7"
            onPress={() => query.fetchNextPage()}
          >
            <Text className="font-black text-leaf">Load more</Text>
          </Pressable>
        ) : null}
      </View>
    </PageContainer>
  );
}
