import { Text, View } from "react-native";

export function FoundationCard({ eyebrow, title, description }) {
  return (
    <View className="min-h-44 flex-1 rounded-3xl border border-line bg-surface p-6">
      <Text className="text-xs font-bold uppercase tracking-widest text-leaf">
        {eyebrow}
      </Text>
      <Text
        accessibilityRole="header"
        className="mt-4 text-xl font-bold leading-7 text-ink"
      >
        {title}
      </Text>
      <Text className="mt-3 text-base leading-6 text-muted">{description}</Text>
    </View>
  );
}
