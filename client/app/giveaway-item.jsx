import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  giveawayApi,
  giveawayOperationKey,
} from "../src/features/giveaways/giveawayApi";
import { VerificationBadge } from "../src/features/profile/ProfilePrimitives";
import { requestApi } from "../src/features/requests/requestApi";
import {
  formatRequestDate,
  humanize,
  RequestCard,
  RequestNav,
} from "../src/features/requests/RequestPrimitives";
import { apiRequest } from "../src/services/api/client";
import { SafetyActions } from "../src/features/safety/SafetyActions";

const objectIdPattern = /^[0-9a-fA-F]{24}$/;

export default function GiveawayItemScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams();
  const itemId = typeof params.itemId === "string" ? params.itemId : "";
  const validId = objectIdPattern.test(itemId);
  const { authenticatedRequest, isAuthenticated, status, user } = useAuth();
  const requester = isAuthenticated ? authenticatedRequest : apiRequest;
  const [selectedNeed, setSelectedNeed] = useState(null);
  const [quantity, setQuantity] = useState("1");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const itemQuery = useQuery({
    queryKey: ["giveaway-item", itemId, user?.id ?? "public"],
    queryFn: () => giveawayApi.get(requester, itemId),
    enabled: validId,
  });
  const item = itemQuery.data?.item;
  const ownerId = item?.ownerId ?? item?.owner?.id;
  const isOwner = Boolean(user?.id && ownerId === user.id);
  const myRequestsQuery = useQuery({
    queryKey: ["giveaway-reservation-requests", user?.id],
    queryFn: () => requestApi.listMine(authenticatedRequest, { limit: 50 }),
    enabled: Boolean(isAuthenticated && item && !isOwner),
  });
  const eligibleNeeds = useMemo(
    () =>
      (myRequestsQuery.data?.items ?? []).flatMap((request) =>
        ["published", "partially_solved"].includes(request.status)
          ? request.needItems
              .filter(
                (need) => need.type === "item" && need.remainingQuantity > 0,
              )
              .map((need) => ({ request, need }))
          : [],
      ),
    [myRequestsQuery.data],
  );
  const matchesQuery = useInfiniteQuery({
    queryKey: ["giveaway-matches", itemId],
    queryFn: ({ pageParam }) =>
      giveawayApi.matches(authenticatedRequest, itemId, {
        limit: 12,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled: Boolean(isOwner),
  });
  const matches = matchesQuery.data?.pages.flatMap((page) => page.items) ?? [];

  async function reserve() {
    if (!selectedNeed) {
      setActionError("Choose one of your published item needs first.");
      return;
    }
    const parsedQuantity = Number(quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 1) {
      setActionError("Enter a whole quantity of at least 1.");
      return;
    }
    setBusy(true);
    setActionError("");
    try {
      await giveawayApi.reserve(
        authenticatedRequest,
        itemId,
        {
          requestId: selectedNeed.request.id,
          needItemId: selectedNeed.need.id,
          quantity: parsedQuantity,
        },
        giveawayOperationKey("giveaway-reserve", itemId),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["giveaway-item", itemId] }),
        queryClient.invalidateQueries({ queryKey: ["giveaway-items"] }),
        queryClient.invalidateQueries({ queryKey: ["giveaway-handoffs"] }),
        queryClient.invalidateQueries({ queryKey: ["my-requests"] }),
      ]);
      router.push("/giveaway-handoffs");
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  function remove() {
    Alert.alert(
      "Remove this listing?",
      "It will no longer appear publicly. Listings with active reservations cannot be removed.",
      [
        { text: "Keep listing", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await giveawayApi.remove(authenticatedRequest, itemId);
              await queryClient.invalidateQueries({
                queryKey: ["giveaway-items"],
              });
              router.replace("/my-giveaways");
            } catch (error) {
              setActionError(error.message);
            }
          },
        },
      ],
    );
  }

  return (
    <PageContainer>
      <RequestNav
        action={
          isAuthenticated ? (
            <Link href="/giveaway-handoffs" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="font-black text-leaf">My handoffs</Text>
              </Pressable>
            </Link>
          ) : null
        }
      />
      {!validId ? (
        <FormNotice>This giveaway link is incomplete or invalid.</FormNotice>
      ) : null}
      {itemQuery.isLoading || status === "loading" ? (
        <View className="items-center py-20">
          <ActivityIndicator color="#18392B" size="large" />
        </View>
      ) : null}
      {itemQuery.error ? (
        <FormNotice>{itemQuery.error.message}</FormNotice>
      ) : null}
      {actionError ? <FormNotice>{actionError}</FormNotice> : null}
      {item ? (
        <View className="mx-auto w-full max-w-4xl">
          <View className="rounded-3xl border border-line bg-surface p-7 md:p-12">
            <View className="flex-row flex-wrap items-center justify-between gap-3">
              <Text className="text-xs font-black uppercase tracking-wider text-coral">
                {humanize(item.category)} · {humanize(item.condition)}
              </Text>
              <View className="rounded-full bg-mint px-3 py-2">
                <Text className="text-xs font-black uppercase text-pine">
                  {humanize(item.status)}
                </Text>
              </View>
            </View>
            <Text className="mt-5 text-4xl font-black text-ink md:text-6xl">
              {item.title}
            </Text>
            <Text className="mt-5 text-base leading-8 text-muted">
              {item.description}
            </Text>
            <View className="mt-7 flex-row flex-wrap gap-4 border-y border-line py-6">
              <View className="min-w-40 flex-1">
                <Text className="text-xs font-bold uppercase text-muted">
                  Available
                </Text>
                <Text className="mt-2 font-black text-ink">
                  {item.availableQuantity} of {item.quantity}
                </Text>
              </View>
              <View className="min-w-40 flex-1">
                <Text className="text-xs font-bold uppercase text-muted">
                  General location
                </Text>
                <Text className="mt-2 font-black text-ink">
                  {item.publicLocation.city}, {item.publicLocation.province}
                </Text>
              </View>
              <View className="min-w-40 flex-1">
                <Text className="text-xs font-bold uppercase text-muted">
                  Listed
                </Text>
                <Text className="mt-2 font-black text-ink">
                  {formatRequestDate(item.createdAt)}
                </Text>
              </View>
            </View>
            <View className="mt-7 rounded-2xl bg-mint p-5">
              <Text className="text-xl font-black text-pine">
                Always free — no payment or trade
              </Text>
              <Text className="mt-2 text-sm leading-6 text-leaf">
                SolveOne records only a two-party-confirmed handoff. Arrange a
                safe public meeting place and do not share passwords, OTPs, or
                banking details.
              </Text>
            </View>
            {item.owner ? (
              <View className="mt-7 flex-row flex-wrap items-center gap-3">
                <Text className="font-black text-ink">
                  {item.owner.displayName}
                </Text>
                <VerificationBadge level={item.owner.verificationLevel} />
              </View>
            ) : null}
            {isOwner ? (
              <Pressable
                accessibilityRole="button"
                className="mt-6 min-h-12 items-center justify-center rounded-xl border border-coral px-4"
                onPress={remove}
              >
                <Text className="font-black text-coral">Remove listing</Text>
              </Pressable>
            ) : null}
            {!isOwner && item.owner ? (
              <SafetyActions targetId={item.id} targetType="giveaway_item" />
            ) : null}
          </View>

          {isOwner && item.availableQuantity > 0 ? (
            <View className="mt-8">
              <Text className="text-3xl font-black text-ink">
                Matching open needs
              </Text>
              <Text className="mt-2 leading-7 text-muted">
                Deterministic matches use the same category and show only open
                item needs. You cannot reserve your own listing.
              </Text>
              {matchesQuery.error ? (
                <View className="mt-5">
                  <FormNotice>{matchesQuery.error.message}</FormNotice>
                </View>
              ) : null}
              {!matchesQuery.isLoading && !matches.length ? (
                <View className="mt-5 rounded-3xl border border-line bg-surface p-7">
                  <Text className="text-xl font-black text-ink">
                    No matching needs yet
                  </Text>
                </View>
              ) : null}
              <View className="mt-5 gap-4">
                {matches.map((match) => (
                  <RequestCard key={match.id} request={match} />
                ))}
              </View>
            </View>
          ) : null}

          {!isOwner && isAuthenticated && item.status === "available" ? (
            <View className="mt-8 rounded-3xl border border-line bg-surface p-6 md:p-8">
              <Text className="text-3xl font-black text-ink">
                Reserve for one of your needs
              </Text>
              <Text className="mt-2 leading-7 text-muted">
                Only your published item needs are eligible. Reservation holds
                both the listing quantity and request capacity.
              </Text>
              {myRequestsQuery.error ? (
                <View className="mt-5">
                  <FormNotice>{myRequestsQuery.error.message}</FormNotice>
                </View>
              ) : null}
              <View className="mt-5 gap-3">
                {eligibleNeeds.map((candidate) => {
                  const selected =
                    selectedNeed?.need.id === candidate.need.id &&
                    selectedNeed?.request.id === candidate.request.id;
                  return (
                    <Pressable
                      key={`${candidate.request.id}:${candidate.need.id}`}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: selected }}
                      className={`rounded-2xl border p-4 ${
                        selected
                          ? "border-pine bg-mint"
                          : "border-line bg-white"
                      }`}
                      onPress={() => setSelectedNeed(candidate)}
                    >
                      <Text className="font-black text-ink">
                        {candidate.need.name}
                      </Text>
                      <Text className="mt-1 text-sm text-muted">
                        {candidate.request.title} ·{" "}
                        {candidate.need.remainingQuantity} still open
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {!myRequestsQuery.isLoading && !eligibleNeeds.length ? (
                <Text className="mt-5 leading-7 text-muted">
                  You do not have a published item need with remaining quantity.
                  Create or complete request moderation first.
                </Text>
              ) : null}
              {eligibleNeeds.length ? (
                <>
                  <Text className="mb-2 mt-5 text-sm font-bold text-ink">
                    Quantity to reserve
                  </Text>
                  <TextInput
                    accessibilityLabel="Quantity to reserve"
                    className="min-h-12 rounded-xl border border-line bg-white px-4 text-ink"
                    keyboardType="number-pad"
                    onChangeText={setQuantity}
                    value={quantity}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: busy }}
                    className={`mt-5 min-h-14 items-center justify-center rounded-2xl px-5 ${
                      busy ? "bg-muted" : "bg-pine"
                    }`}
                    disabled={busy}
                    onPress={reserve}
                  >
                    <Text className="font-black text-white">
                      {busy ? "Reserving…" : "Reserve free item"}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
          {!isOwner && !isAuthenticated ? (
            <View className="mt-8 rounded-3xl border border-line bg-surface p-7">
              <Text className="text-2xl font-black text-ink">
                Sign in to reserve
              </Text>
              <Text className="mt-2 leading-7 text-muted">
                A reservation must be tied to your own published item need.
              </Text>
              <Link href="/login" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="mt-5 min-h-12 items-center justify-center rounded-xl bg-pine px-4"
                >
                  <Text className="font-black text-white">Sign in</Text>
                </Pressable>
              </Link>
            </View>
          ) : null}
        </View>
      ) : null}
    </PageContainer>
  );
}
