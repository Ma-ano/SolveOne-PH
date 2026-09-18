import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "expo-router";
import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";
import { FormNotice } from "../src/features/auth/FormControls";
import { useAuth } from "../src/features/auth/AuthContext";
import { giveawayApi } from "../src/features/giveaways/giveawayApi";
import { GiveawayCard } from "../src/features/giveaways/GiveawayPrimitives";
import {
  giveawayCategories,
  giveawayConditions,
} from "../src/features/giveaways/schemas";
import {
  humanize,
  RequestNav,
} from "../src/features/requests/RequestPrimitives";

export default function GiveawayItemsScreen() {
  const { isAuthenticated } = useAuth();
  const [category, setCategory] = useState("");
  const [condition, setCondition] = useState("");
  const [province, setProvince] = useState("");
  const [applied, setApplied] = useState({});
  const listingQuery = useInfiniteQuery({
    queryKey: ["giveaway-items", applied],
    queryFn: ({ pageParam }) =>
      giveawayApi.list({ ...applied, limit: 12, cursor: pageParam }),
    initialPageParam: undefined,
    getNextPageParam: (page) => page.pageInfo.nextCursor ?? undefined,
  });
  const items = listingQuery.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <PageContainer>
      <RequestNav
        action={
          isAuthenticated ? (
            <View className="flex-row flex-wrap gap-2">
              <Link href="/my-giveaways" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-12 justify-center rounded-xl border border-leaf px-4"
                >
                  <Text className="font-black text-leaf">My items</Text>
                </Pressable>
              </Link>
              <Link href="/giveaway-create" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-12 justify-center rounded-xl bg-pine px-4"
                >
                  <Text className="font-black text-white">List an item</Text>
                </Pressable>
              </Link>
            </View>
          ) : null
        }
      />
      <View className="w-full">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Things I don't need
        </Text>
        <Text className="mt-3 text-4xl font-black tracking-tight text-ink md:text-6xl">
          Useful things, passed forward for free.
        </Text>
        <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
          These are community giveaways, never sale listings. Reserve an item
          only for a published item need you own; impact is recorded after both
          people confirm the handoff.
        </Text>

        <View className="mt-8 rounded-3xl border border-line bg-surface p-6">
          <Text className="font-black text-ink">Filter available items</Text>
          <View className="mt-4 flex-row flex-wrap gap-2">
            {["", ...giveawayCategories].map((value) => (
              <Pressable
                key={value || "all"}
                accessibilityRole="radio"
                accessibilityState={{ checked: category === value }}
                className={`min-h-11 justify-center rounded-full border px-3 ${
                  category === value
                    ? "border-pine bg-mint"
                    : "border-line bg-white"
                }`}
                onPress={() => setCategory(value)}
              >
                <Text className="text-sm font-bold text-ink">
                  {value ? humanize(value) : "All categories"}
                </Text>
              </Pressable>
            ))}
          </View>
          <View className="mt-4 flex-row flex-wrap gap-2">
            {["", ...giveawayConditions].map((value) => (
              <Pressable
                key={value || "any"}
                accessibilityRole="radio"
                accessibilityState={{ checked: condition === value }}
                className={`min-h-11 justify-center rounded-full border px-3 ${
                  condition === value
                    ? "border-pine bg-mint"
                    : "border-line bg-white"
                }`}
                onPress={() => setCondition(value)}
              >
                <Text className="text-sm font-bold text-ink">
                  {value ? humanize(value) : "Any condition"}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            accessibilityLabel="Province filter"
            className="mt-4 min-h-12 rounded-xl border border-line bg-white px-4 text-ink"
            maxLength={80}
            onChangeText={setProvince}
            placeholder="Province (optional)"
            value={province}
          />
          <Pressable
            accessibilityRole="button"
            className="mt-4 min-h-12 items-center justify-center rounded-xl bg-leaf px-4"
            onPress={() =>
              setApplied({
                ...(category ? { category } : {}),
                ...(condition ? { condition } : {}),
                ...(province.trim() ? { province: province.trim() } : {}),
              })
            }
          >
            <Text className="font-black text-white">Apply filters</Text>
          </Pressable>
        </View>

        {listingQuery.error ? (
          <View className="mt-6">
            <FormNotice>{listingQuery.error.message}</FormNotice>
          </View>
        ) : null}
        {listingQuery.isLoading ? (
          <Text className="py-12 text-center font-semibold text-muted">
            Loading free items…
          </Text>
        ) : null}
        {!listingQuery.isLoading && !items.length ? (
          <View className="mt-6 rounded-3xl border border-line bg-surface p-8">
            <Text className="text-2xl font-black text-ink">
              No available items match
            </Text>
            <Text className="mt-3 leading-7 text-muted">
              Try a broader filter. Your first useful listing can make a
              practical difference.
            </Text>
          </View>
        ) : null}
        <View className="mt-6 gap-4">
          {items.map((item) => (
            <GiveawayCard item={item} key={item.id} />
          ))}
        </View>
        {listingQuery.hasNextPage ? (
          <Pressable
            accessibilityRole="button"
            className="mx-auto mt-8 min-h-14 justify-center rounded-2xl border border-leaf px-7"
            disabled={listingQuery.isFetchingNextPage}
            onPress={() => listingQuery.fetchNextPage()}
          >
            <Text className="font-black text-leaf">
              {listingQuery.isFetchingNextPage ? "Loading…" : "Load more"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </PageContainer>
  );
}
