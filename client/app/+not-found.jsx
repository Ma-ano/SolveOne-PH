import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { PageContainer } from "../src/components/PageContainer";

export default function NotFoundScreen() {
  return (
    <PageContainer>
      <View className="max-w-xl flex-1 justify-center py-16">
        <Text className="text-xs font-bold uppercase tracking-widest text-coral">
          Page not found
        </Text>
        <Text
          accessibilityRole="header"
          className="mt-3 text-page-title font-black text-ink md:text-page-title-lg"
        >
          This path doesn’t lead to a problem yet.
        </Text>
        <Text className="mt-4 text-base leading-7 text-muted">
          Return to the SolveOne foundation screen and continue from there.
        </Text>
        <Link href="/" asChild>
          <Pressable
            accessibilityRole="link"
            className="mt-8 min-h-11 self-start justify-center rounded-full bg-pine px-6 py-3 active:bg-leaf"
          >
            <Text className="font-bold text-white">Return home</Text>
          </Pressable>
        </Link>
      </View>
    </PageContainer>
  );
}
