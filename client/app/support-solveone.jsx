import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Pressable, Text, TextInput, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { AuthLink } from "../src/features/auth/AuthShell";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import {
  donationApi,
  donationOperationKey,
} from "../src/features/donations/donationApi";
import {
  formatPesos,
  RequestNav,
} from "../src/features/requests/RequestPrimitives";

const presetPesos = [100, 250, 500, 1000];

function donationTime(value) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export default function SupportSolveOneScreen() {
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();
  const { authenticatedRequest, status, user } = useAuth();
  const [amount, setAmount] = useState("250");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const pendingOperation = useRef(null);
  const enabled = status === "authenticated";
  const historyQuery = useInfiniteQuery({
    queryKey: ["platform-donations", user?.id],
    queryFn: ({ pageParam }) =>
      donationApi.history(authenticatedRequest, {
        limit: 20,
        cursor: pageParam,
      }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
    enabled,
  });
  const donations =
    historyQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const returnState = typeof params.return === "string" ? params.return : "";

  function changeAmount(next) {
    setAmount(next);
    pendingOperation.current = null;
    setNotice("");
  }

  async function beginCheckout() {
    const pesos = amount.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(pesos)) {
      setNotice(
        "Enter an amount in pesos with no more than two decimal places.",
      );
      return;
    }
    const centavos = Math.round(Number(pesos) * 100);
    if (
      !Number.isSafeInteger(centavos) ||
      centavos < 1000 ||
      centavos > 1000000
    ) {
      setNotice("Choose an optional platform donation from ₱10 to ₱10,000.");
      return;
    }
    if (!pendingOperation.current)
      pendingOperation.current = {
        amountCentavos: centavos,
        key: donationOperationKey(),
      };
    if (pendingOperation.current.amountCentavos !== centavos) {
      pendingOperation.current = {
        amountCentavos: centavos,
        key: donationOperationKey(),
      };
    }
    setBusy(true);
    setNotice("");
    try {
      const result = await donationApi.checkout(
        authenticatedRequest,
        centavos,
        pendingOperation.current.key,
      );
      await queryClient.invalidateQueries({ queryKey: ["platform-donations"] });
      if (!result.checkoutUrl) {
        pendingOperation.current = null;
        setNotice(
          "This donation is already settled. Refresh history for the verified status.",
        );
        return;
      }
      const opened = await Linking.openURL(result.checkoutUrl);
      if (opened === false)
        throw new Error("The hosted checkout could not be opened.");
      pendingOperation.current = null;
      setNotice(
        "Checkout opened with PayMongo. A redirect alone does not confirm payment; status changes only after a verified webhook.",
      );
    } catch (error) {
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (status !== "authenticated") {
    return (
      <PageContainer>
        <RequestNav />
        <View className="mx-auto w-full max-w-xl rounded-3xl border border-line bg-surface p-8">
          <Text className="text-3xl font-black text-ink">
            Sign in to support the platform
          </Text>
          <Text className="mt-3 leading-7 text-muted">
            A signed-in account keeps checkout retries and donation history
            private and consistent.
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
          user?.role === "admin" ? (
            <Link href="/admin/donations">Admin dashboard</Link>
          ) : null
        }
      />
      <View className="mx-auto w-full max-w-3xl gap-7">
        <View>
          <Text className="text-xs font-bold uppercase tracking-widest text-coral">
            Support SolveOne
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-3 text-4xl font-black text-ink"
          >
            Keep practical help moving
          </Text>
          <Text className="mt-4 leading-7 text-muted">
            This optional donation supports operation of the SolveOne PH
            platform. It does not fund a specific request or recipient, does not
            create a wallet or payout, and does not buy verification, ranking,
            or preferential treatment.
          </Text>
        </View>
        {returnState ? (
          <FormNotice tone="success">
            {returnState === "success"
              ? "You returned from checkout. Payment is still pending until PayMongo's signed webhook confirms it. Refresh history below."
              : "Checkout was closed. A pending record may remain; no payment is counted unless a signed webhook confirms it."}
          </FormNotice>
        ) : null}
        {notice ? <FormNotice>{notice}</FormNotice> : null}
        <View className="rounded-3xl border border-line bg-surface p-6 md:p-9">
          <Text className="text-2xl font-black text-ink">Choose an amount</Text>
          <View className="mt-4 flex-row flex-wrap gap-3">
            {presetPesos.map((value) => (
              <Pressable
                accessibilityRole="button"
                className="min-h-12 justify-center rounded-xl border border-leaf px-5"
                key={value}
                onPress={() => changeAmount(String(value))}
              >
                <Text className="font-bold text-leaf">
                  ₱{value.toLocaleString("en-PH")}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="mb-2 mt-5 font-bold text-ink">
            Custom amount in Philippine pesos
          </Text>
          <TextInput
            accessibilityLabel="Donation amount in Philippine pesos"
            className="min-h-14 rounded-xl border border-line bg-white px-4 text-lg text-ink"
            inputMode="decimal"
            onChangeText={changeAmount}
            value={amount}
          />
          <Text className="mt-3 text-sm leading-6 text-muted">
            Minimum ₱10, maximum ₱10,000. PayMongo hosts payment entry; SolveOne
            does not collect card or wallet credentials.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="mt-5 min-h-14 justify-center self-start rounded-xl bg-pine px-6"
            disabled={busy}
            onPress={beginCheckout}
          >
            <Text className="font-black text-white">
              {busy ? "Preparing secure checkout…" : "Continue to PayMongo"}
            </Text>
          </Pressable>
        </View>
        <View>
          <View className="flex-row flex-wrap items-center justify-between gap-3">
            <Text className="text-2xl font-black text-ink">
              Your platform donation history
            </Text>
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center"
              onPress={() => historyQuery.refetch()}
            >
              <Text className="font-bold text-leaf">
                Refresh verified status
              </Text>
            </Pressable>
          </View>
          {historyQuery.error ? (
            <FormNotice>{historyQuery.error.message}</FormNotice>
          ) : null}
          {!historyQuery.isLoading && !donations.length ? (
            <Text className="mt-4 text-muted">No checkout history yet.</Text>
          ) : null}
          <View className="mt-4 gap-3">
            {donations.map((item) => (
              <View
                className="rounded-2xl border border-line bg-white p-5"
                key={item.id}
              >
                <View className="flex-row flex-wrap items-center justify-between gap-3">
                  <Text className="text-lg font-black text-ink">
                    {formatPesos(item.amountCentavos)}
                  </Text>
                  <Text className="text-xs font-black uppercase tracking-wider text-leaf">
                    {item.status}
                  </Text>
                </View>
                <Text className="mt-2 text-sm text-muted">
                  Platform support · {donationTime(item.createdAt)} ·{" "}
                  {item.mode} mode
                </Text>
                {item.refundedAmountCentavos ? (
                  <Text className="mt-2 text-sm text-coral">
                    Refunded: {formatPesos(item.refundedAmountCentavos)}
                  </Text>
                ) : null}
              </View>
            ))}
          </View>
          {historyQuery.hasNextPage ? (
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center"
              onPress={() => historyQuery.fetchNextPage()}
            >
              <Text className="font-bold text-leaf">Load more</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </PageContainer>
  );
}
