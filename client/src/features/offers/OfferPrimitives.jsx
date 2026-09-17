import { Text, View } from "react-native";

import {
  formatPesos,
  formatRequestDate,
  humanize,
  StatusBadge,
} from "../requests/RequestPrimitives";
import { VerificationBadge } from "../profile/ProfilePrimitives";

function offerCommitment(offer) {
  if (offer.helpType === "money") {
    return `${formatPesos(offer.pledgedValueCentavos)} pledge`;
  }
  const duration = offer.estimatedMinutes
    ? ` · about ${offer.estimatedMinutes} minutes`
    : "";
  return `${offer.quantity} ${offer.quantity === 1 ? "unit" : "units"}${duration}`;
}

export function OfferCard({ offer, perspective, actions }) {
  const person =
    perspective === "owner" ? offer.helper : (offer.request?.owner ?? null);
  return (
    <View className="rounded-3xl border border-line bg-surface p-6">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          {humanize(offer.helpType)} · {offerCommitment(offer)}
        </Text>
        <StatusBadge status={offer.status} />
      </View>
      <Text className="mt-4 text-xl font-black text-ink">
        {offer.request?.title ?? "Help offer"}
      </Text>
      <Text className="mt-1 text-sm font-bold text-leaf">
        {offer.request?.needItem?.name ?? "Selected need"}
      </Text>
      <Text className="mt-4 text-base leading-7 text-muted">
        {offer.message}
      </Text>
      {person ? (
        <View className="mt-5 flex-row flex-wrap items-center gap-3 border-t border-line pt-4">
          <Text className="font-black text-ink">{person.displayName}</Text>
          <VerificationBadge level={person.verificationLevel} />
        </View>
      ) : null}
      <Text className="mt-4 text-xs font-semibold text-muted">
        Offered {formatRequestDate(offer.createdAt)}
      </Text>
      {actions ? (
        <View className="mt-5 flex-row flex-wrap gap-2">{actions}</View>
      ) : null}
    </View>
  );
}
