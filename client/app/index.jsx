import { Link } from "expo-router";
import { Alert, Pressable, Text, View } from "react-native";

import { FoundationCard } from "../src/components/FoundationCard";
import { PageContainer } from "../src/components/PageContainer";
import { useAuth } from "../src/features/auth/AuthContext";

export default function HomeScreen() {
  const { isAuthenticated, logout, logoutAll, status, user } = useAuth();

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
      <View className="flex-row items-center justify-between border-b border-line pb-5">
        <View>
          <Text className="text-xl font-black tracking-tight text-pine">
            SolveOne PH
          </Text>
          <Text className="mt-1 text-xs font-semibold uppercase tracking-widest text-muted">
            Problems solved
          </Text>
        </View>
        {status === "loading" ? (
          <Text className="text-sm font-semibold text-muted">
            Restoring session…
          </Text>
        ) : isAuthenticated ? (
          <Pressable
            accessibilityRole="button"
            className="min-h-12 justify-center rounded-xl px-3"
            onPress={logout}
          >
            <Text className="text-sm font-bold text-leaf">Sign out</Text>
          </Pressable>
        ) : (
          <View className="flex-row gap-2">
            <Link href="/login" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl px-3"
              >
                <Text className="text-sm font-bold text-leaf">Sign in</Text>
              </Pressable>
            </Link>
            <Link href="/register" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl bg-pine px-4"
              >
                <Text className="text-sm font-black text-white">Join</Text>
              </Pressable>
            </Link>
          </View>
        )}
      </View>

      {isAuthenticated ? (
        <View className="mb-4 rounded-2xl border border-mint bg-mint p-4">
          <Text className="font-bold text-pine">
            Signed in as {user.firstName} {user.lastName}
          </Text>
          <Text className="mt-1 text-sm text-muted">
            {user.email} · {user.verificationLevel}
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            <Link href="/my-requests" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl bg-leaf px-4"
              >
                <Text className="text-sm font-black text-white">
                  My requests
                </Text>
              </Pressable>
            </Link>
            <Link href="/profile" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl bg-pine px-4"
              >
                <Text className="text-sm font-black text-white">
                  Edit profile
                </Text>
              </Pressable>
            </Link>
            <Link href="/my-offers" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="text-sm font-black text-leaf">My offers</Text>
              </Pressable>
            </Link>
            <Link href="/conversations" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="text-sm font-black text-leaf">Messages</Text>
              </Pressable>
            </Link>
            <Link href="/support-solveone" asChild>
              <Pressable
                accessibilityRole="link"
                className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              >
                <Text className="text-sm font-black text-leaf">
                  Support SolveOne
                </Text>
              </Pressable>
            </Link>
            <Pressable
              accessibilityRole="button"
              className="min-h-12 justify-center rounded-xl border border-leaf px-4"
              onPress={handleLogoutAll}
            >
              <Text className="text-sm font-bold text-leaf">
                Sign out all devices
              </Text>
            </Pressable>
            {["moderator", "admin"].includes(user.role) ? (
              <>
                <Link href="/admin/requests" asChild>
                  <Pressable
                    accessibilityRole="link"
                    className="min-h-12 justify-center rounded-xl border border-coral px-4"
                  >
                    <Text className="text-sm font-bold text-coral">
                      Review requests
                    </Text>
                  </Pressable>
                </Link>
                <Link href="/admin/missions" asChild>
                  <Pressable
                    accessibilityRole="link"
                    className="min-h-12 justify-center rounded-xl border border-coral px-4"
                  >
                    <Text className="text-sm font-bold text-coral">
                      Verify missions
                    </Text>
                  </Pressable>
                </Link>
                <Link href="/admin/reports" asChild>
                  <Pressable
                    accessibilityRole="link"
                    className="min-h-12 justify-center rounded-xl border border-coral px-4"
                  >
                    <Text className="text-sm font-bold text-coral">
                      Review safety reports
                    </Text>
                  </Pressable>
                </Link>
              </>
            ) : null}
            {user.role === "admin" ? (
              <Link href="/admin/donations" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-12 justify-center rounded-xl border border-coral px-4"
                >
                  <Text className="text-sm font-bold text-coral">
                    Donation dashboard
                  </Text>
                </Pressable>
              </Link>
            ) : null}
          </View>
        </View>
      ) : null}

      <View className="mb-2 flex-row flex-wrap gap-3">
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

      <View className="max-w-4xl py-14 md:py-24">
        <Text className="text-sm font-bold uppercase tracking-widest text-coral">
          Small help matters
        </Text>
        <Text
          accessibilityRole="header"
          className="mt-5 text-5xl font-black leading-tight tracking-tight text-ink md:text-7xl"
        >
          One clear problem. One practical way forward.
        </Text>
        <Text className="mt-6 max-w-2xl text-lg leading-8 text-muted md:text-xl">
          You don’t need to change the world. Solve one thing—with an item, a
          skill, some time, or a small amount you can spare.
        </Text>
      </View>

      <View className="gap-4 pb-10 md:flex-row">
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
      </View>
    </PageContainer>
  );
}
