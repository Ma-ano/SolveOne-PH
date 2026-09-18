import { Link } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";

import { FoundationCard } from "../src/components/FoundationCard";
import { PageContainer } from "../src/components/PageContainer";
import { ResponsiveGrid } from "../src/components/ResponsiveGrid";
import { useAuth } from "../src/features/auth/AuthContext";

export default function HomeScreen() {
  const { isAuthenticated, logoutAll, user } = useAuth();

  async function handleLogoutAll() {
    try {
      await logoutAll();
    } catch (error) {
      Alert.alert(
        "Signed out on this device",
        `Other sessions could not be confirmed as signed out. ${error.message}`,
      );
    }
  }

  return (
    <PageContainer>
      {isAuthenticated ? (
        <View className="mb-4 rounded-2xl border border-mint bg-mint p-4">
          <Text className="font-bold text-pine">
            Signed in as {user.firstName} {user.lastName}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {user.email} · {user.verificationLevel}
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              onPress={handleLogoutAll}
            >
              <Text className="text-sm font-bold text-leaf">
                Sign out all devices
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View className="rounded-3xl border border-line bg-surface px-6 py-10 md:px-10 md:py-14">
        <View className="max-w-4xl">
          <Text className="text-xs font-bold uppercase tracking-widest text-coral">
            Small help matters
          </Text>
          <Text
            accessibilityRole="header"
            className="mt-3 text-page-title font-black text-ink md:text-page-title-lg"
          >
            One clear problem. One practical way forward.
          </Text>
          <Text className="mt-4 max-w-3xl text-base leading-7 text-muted">
            You don’t need to change the world. Solve one thing—with an item, a
            skill, some time, or a small amount you can spare.
          </Text>
        </View>
        <View className="mt-8 flex-row flex-wrap gap-3">
          <Link href="/requests" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-14 justify-center rounded-2xl bg-pine px-6"
            >
              <Text className="font-black text-white">Discover requests</Text>
            </Pressable>
          </Link>
          <Link href={isAuthenticated ? "/request-editor" : "/login"} asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-14 justify-center rounded-2xl border border-leaf px-6"
            >
              <Text className="font-black text-leaf">Create a request</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <ResponsiveGrid className="mt-5 pb-4">
        <FoundationCard
          eyebrow="Concrete"
          title="A finish line people can understand"
          description="Requests will identify the exact item, task, time, or amount that solves the problem."
        />
        <FoundationCard
          eyebrow="Human"
          title="More than money"
          description="Skills, useful time, digital assistance, and reusable items are first-class ways to help."
        />
        <FoundationCard
          eyebrow="Trustworthy"
          title="Privacy before publicity"
          description="Moderation and factual verification protect people without exposing their private details."
        />
      </ResponsiveGrid>
    </PageContainer>
  );
}
