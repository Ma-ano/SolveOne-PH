import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

const footerLinks = [
  ["/requests", "Requests"],
  ["/giveaway-items", "Free items"],
  ["/community-missions", "Missions"],
  ["/impact", "Impact"],
  ["/safety", "Safety"],
  ["/support-solveone", "Support us"],
];

export function AppFooter() {
  return (
    <View className="mt-16 border-t border-line py-8 md:mt-24 md:py-10">
      <View className="items-center gap-7 md:flex-row md:items-end md:justify-between">
        <View className="max-w-xl items-center md:items-start">
          <Text className="text-center text-lg font-black text-pine md:text-left">
            SolveOne PH
          </Text>
          <Text className="mt-2 text-center text-sm leading-6 text-muted md:text-left">
            A community-powered place for practical help, free items, and local
            missions across the Philippines. Share safely, meet responsibly, and
            help solve one problem at a time.
          </Text>
        </View>
        <View className="flex-row flex-wrap justify-center gap-x-5 gap-y-1 md:justify-end">
          {footerLinks.map(([href, label]) => (
            <Link key={href} href={href} asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-11 justify-center"
              >
                <Text className="text-sm font-bold text-leaf">{label}</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </View>
      <Text className="mt-7 text-center text-xs font-semibold uppercase tracking-widest text-muted md:text-left">
        Built for neighbors helping neighbors.
      </Text>
    </View>
  );
}
