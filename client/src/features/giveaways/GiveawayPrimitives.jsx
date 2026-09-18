import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { formatRequestDate, humanize } from "../requests/RequestPrimitives";
import { VerificationBadge } from "../profile/ProfilePrimitives";

export function GiveawayCard({ item, actions }) {
  return (
    <View className="h-full rounded-3xl border border-line bg-surface p-6">
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
      <Text className="mt-4 text-2xl font-black text-ink">{item.title}</Text>
      <Text className="mt-3 leading-7 text-muted" numberOfLines={3}>
        {item.description}
      </Text>
      <View className="mt-4 flex-row flex-wrap gap-x-5 gap-y-2">
        <Text className="text-sm font-bold text-leaf">
          {item.availableQuantity} of {item.quantity} available
        </Text>
        <Text className="text-sm font-semibold text-muted">
          {item.publicLocation?.city}, {item.publicLocation?.province}
        </Text>
      </View>
      {item.owner ? (
        <View className="mt-4 flex-row flex-wrap items-center gap-3">
          <Text className="font-bold text-ink">{item.owner.displayName}</Text>
          <VerificationBadge level={item.owner.verificationLevel} />
        </View>
      ) : null}
      <Text className="mt-3 text-xs text-muted">
        Listed {formatRequestDate(item.createdAt)} · Always free
      </Text>
      <View className="mt-5 flex-row flex-wrap gap-3">
        <Link
          href={{ pathname: "/giveaway-item", params: { itemId: item.id } }}
          asChild
        >
          <Pressable
            accessibilityRole="link"
            className="min-h-12 justify-center rounded-xl bg-pine px-4"
          >
            <Text className="font-black text-white">View item</Text>
          </Pressable>
        </Link>
        {actions}
      </View>
    </View>
  );
}

export function HandoffCard({ reservation, currentUserId, actions }) {
  const isDonor = reservation.donorId === currentUserId;
  const other = isDonor ? reservation.recipient : reservation.donor;
  const ownConfirmed = isDonor
    ? reservation.donorConfirmedAt
    : reservation.recipientConfirmedAt;
  const otherConfirmed = isDonor
    ? reservation.recipientConfirmedAt
    : reservation.donorConfirmedAt;
  return (
    <View className="h-full rounded-3xl border border-line bg-surface p-6">
      <Text className="text-xs font-black uppercase tracking-wider text-coral">
        {isDonor ? "You are giving" : "You are receiving"} ·{" "}
        {reservation.status}
      </Text>
      <Text className="mt-3 text-2xl font-black text-ink">
        {reservation.item?.title ?? "Giveaway item"}
      </Text>
      <Text className="mt-2 leading-6 text-muted">
        Quantity {reservation.quantity} for “{reservation.request?.title}”
      </Text>
      <Text className="mt-3 font-bold text-leaf">
        Handoff with {other?.displayName ?? "participant"}
      </Text>
      <View className="mt-4 rounded-2xl bg-mint p-4">
        <Text className="text-sm font-semibold text-pine">
          Your confirmation: {ownConfirmed ? "confirmed" : "waiting"}
        </Text>
        <Text className="mt-1 text-sm font-semibold text-pine">
          Their confirmation: {otherConfirmed ? "confirmed" : "waiting"}
        </Text>
      </View>
      {actions ? (
        <View className="mt-5 flex-row flex-wrap gap-3">{actions}</View>
      ) : null}
    </View>
  );
}
