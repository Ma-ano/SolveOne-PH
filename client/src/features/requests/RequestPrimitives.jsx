import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

const labels = Object.freeze({
  money: "Money",
  item: "Item",
  skill: "Skill",
  time: "Time",
  normal: "Normal",
  important: "Important",
  time_sensitive: "Time-sensitive",
  pending_review: "Pending review",
  changes_requested: "Changes requested",
  partially_solved: "Partially solved",
  digital_alalay: "Digital Alalay",
});

export function humanize(value) {
  return labels[value] ?? value?.replaceAll("_", " ") ?? "";
}

export function formatPesos(centavos) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: Number(centavos) % 100 === 0 ? 0 : 2,
  }).format((Number(centavos) || 0) / 100);
}

export function formatRequestDate(value) {
  if (!value) {
    return "No date yet";
  }
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

export function RequestNav({ action }) {
  if (!action) return null;
  return (
    <View className="mb-7 flex-row flex-wrap items-center justify-end gap-2 self-end rounded-2xl border border-line bg-surface p-2">
      {action}
    </View>
  );
}

export function StatusBadge({ status }) {
  const attention = ["changes_requested", "rejected", "cancelled"].includes(
    status,
  );
  return (
    <View
      className={`self-start rounded-full px-3 py-2 ${
        attention ? "bg-red-50" : "bg-mint"
      }`}
    >
      <Text
        className={`text-xs font-black uppercase tracking-wider ${
          attention ? "text-coral" : "text-pine"
        }`}
      >
        {humanize(status)}
      </Text>
    </View>
  );
}

export function NeedItemList({ items = [], renderAction }) {
  if (!items.length) {
    return (
      <Text className="text-sm italic text-muted">No need items yet.</Text>
    );
  }
  return (
    <View className="gap-3">
      {items.map((item, index) => (
        <View
          className="rounded-2xl border border-line bg-white p-4"
          key={item.id ?? `${item.name}-${index}`}
        >
          <View className="flex-row flex-wrap items-start justify-between gap-3">
            <View className="flex-1">
              <Text className="font-black text-ink">
                {item.name || "Unnamed need"}
              </Text>
              <Text className="mt-1 text-sm leading-6 text-muted">
                {item.description || "Description not added yet."}
              </Text>
            </View>
            <View className="rounded-full bg-mint px-3 py-2">
              <Text className="text-xs font-bold text-pine">
                {humanize(item.type)}
              </Text>
            </View>
          </View>
          <Text className="mt-3 text-sm font-bold text-leaf">
            Qty {item.quantity}
            {["money", "item"].includes(item.type)
              ? ` · ${formatPesos(item.estimatedValueCentavos)} estimated`
              : ""}
          </Text>
          {item.estimatedMinutes ? (
            <Text className="mt-2 text-sm font-semibold text-muted">
              Approximately {item.estimatedMinutes} minutes
            </Text>
          ) : null}
          {item.type === "money" ? (
            <Text className="mt-2 text-sm font-semibold text-muted">
              {formatPesos(item.solvedValueCentavos)} confirmed ·{" "}
              {formatPesos(item.reservedValueCentavos)} reserved ·{" "}
              {formatPesos(item.remainingValueCentavos)} still open
            </Text>
          ) : item.reservedQuantity !== undefined ? (
            <Text className="mt-2 text-sm font-semibold text-muted">
              {item.solvedQuantity} confirmed · {item.reservedQuantity} reserved
              · {item.remainingQuantity} still open
            </Text>
          ) : null}
          {renderAction ? (
            <View className="mt-4">{renderAction(item)}</View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export function RequestCard({ request, manage = false }) {
  const location = request.publicLocation ?? request.location;
  const href = manage
    ? { pathname: "/request-editor", params: { requestId: request.id } }
    : { pathname: "/request-details", params: { requestId: request.id } };
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        className={`${manage ? "" : "h-full"} rounded-3xl border border-line bg-surface p-6`}
      >
        <View className="flex-row flex-wrap items-center justify-between gap-3">
          <Text className="text-xs font-bold uppercase tracking-widest text-coral">
            {humanize(request.category)}
          </Text>
          <StatusBadge status={request.status} />
        </View>
        <Text className="mt-4 text-2xl font-black tracking-tight text-ink">
          {request.title || "Untitled draft"}
        </Text>
        <Text className="mt-3 text-sm leading-6 text-muted" numberOfLines={3}>
          {request.description ||
            "Continue this draft to add the problem and finish line."}
        </Text>
        {request.discovery ? (
          <View className="mt-4 rounded-2xl bg-mint p-3">
            {request.discovery.estimatedMinutes ? (
              <Text className="text-sm font-black text-pine">
                Approximately {request.discovery.estimatedMinutes} minutes
              </Text>
            ) : null}
            {request.discovery.remainingBudgetCentavos !== null ? (
              <Text className="text-sm font-black text-pine">
                {formatPesos(request.discovery.remainingBudgetCentavos)}{" "}
                remaining
              </Text>
            ) : null}
            {request.discovery.reasons?.length ? (
              <Text className="mt-1 text-xs leading-5 text-leaf">
                {request.discovery.reasons.join(" · ")}
              </Text>
            ) : null}
          </View>
        ) : null}
        {request.giveawayMatch ? (
          <View className="mt-4 rounded-2xl bg-mint p-3">
            <Text className="text-sm font-black text-pine">
              Matching needs:{" "}
              {request.giveawayMatch.needItems
                .map((item) => `${item.name} (${item.remainingQuantity})`)
                .join(", ")}
            </Text>
            <Text className="mt-1 text-xs leading-5 text-leaf">
              {request.giveawayMatch.reasons.join(" · ")}
            </Text>
          </View>
        ) : null}
        <View className="mt-5 flex-row flex-wrap gap-x-5 gap-y-2">
          <Text className="text-sm font-bold text-leaf">
            {request.needItems?.length ?? 0} concrete needs
          </Text>
          <Text className="text-sm font-semibold text-muted">
            {location?.city || "City not set"},{" "}
            {location?.province || "province not set"}
          </Text>
          <Text className="text-sm font-semibold text-muted">
            Needed {formatRequestDate(request.neededBy)}
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}
