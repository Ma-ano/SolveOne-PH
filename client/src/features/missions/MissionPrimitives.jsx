import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { humanize, StatusBadge } from "../requests/RequestPrimitives";

export function MissionResourceList({ resources = [], renderAction }) {
  return (
    <View className="gap-3">
      {resources.map((resource) => (
        <View
          className="rounded-2xl border border-line bg-white p-4"
          key={resource.id}
        >
          <View className="flex-row flex-wrap items-start justify-between gap-3">
            <View className="min-w-0 flex-1">
              <Text className="font-black text-ink">{resource.name}</Text>
              <Text className="mt-1 text-sm leading-6 text-muted">
                {resource.description}
              </Text>
            </View>
            <Text className="rounded-full bg-mint px-3 py-2 text-xs font-black text-pine">
              {humanize(resource.type)}
            </Text>
          </View>
          <Text className="mt-3 text-sm font-bold text-leaf">
            {resource.fulfilledQuantity} confirmed · {resource.reservedQuantity}{" "}
            reserved · {resource.remainingQuantity} open
          </Text>
          {resource.estimatedMinutes ? (
            <Text className="mt-2 text-sm text-muted">
              Approximately {resource.estimatedMinutes} minutes
            </Text>
          ) : null}
          {resource.requiredSkills?.length ? (
            <Text className="mt-2 text-sm text-muted">
              Skills: {resource.requiredSkills.join(", ")}
            </Text>
          ) : null}
          {renderAction && resource.remainingQuantity > 0 ? (
            <View className="mt-4">{renderAction(resource)}</View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function MissionCard({ mission, manage = false }) {
  const location = mission.publicLocation ?? mission.location;
  return (
    <Link
      href={{ pathname: "/mission-details", params: { missionId: mission.id } }}
      asChild
    >
      <Pressable
        accessibilityRole="link"
        className="h-full rounded-3xl border border-line bg-surface p-6"
      >
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <Text className="text-xs font-bold uppercase tracking-widest text-coral">
            {humanize(mission.category)}
          </Text>
          <StatusBadge status={mission.status} />
        </View>
        <Text className="mt-4 text-2xl font-black text-ink">
          {mission.title}
        </Text>
        <Text className="mt-3 text-sm leading-6 text-muted" numberOfLines={3}>
          {mission.description}
        </Text>
        {mission.match?.reasons?.length ? (
          <View className="mt-4 rounded-2xl bg-mint p-3">
            <Text className="text-sm font-bold text-pine">
              {mission.match.reasons.join(" · ")}
            </Text>
          </View>
        ) : null}
        <View className="mt-5 flex-row flex-wrap gap-x-5 gap-y-2">
          <Text className="text-sm font-bold text-leaf">
            {mission.requiredResources.length} resource lines
          </Text>
          <Text className="text-sm text-muted">
            {location?.city}, {location?.province}
          </Text>
          {manage ? (
            <Text className="text-sm font-semibold text-muted">
              Verification: {humanize(mission.verificationStatus)}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Link>
  );
}
