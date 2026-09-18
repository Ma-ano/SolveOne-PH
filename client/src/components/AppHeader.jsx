import { useQuery } from "@tanstack/react-query";
import { Link, usePathname } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useAuth } from "../features/auth/AuthContext";
import { notificationApi } from "../features/notifications/notificationApi";

const publicLinks = [
  ["/requests", "Browse requests"],
  ["/discover", "Find a match"],
  ["/giveaway-items", "Free items"],
  ["/community-missions", "Community missions"],
  ["/impact", "Impact"],
  ["/support-solveone", "Support SolveOne"],
];

const memberLinks = [
  ["/my-requests", "My requests"],
  ["/my-offers", "My offers"],
  ["/conversations", "Messages"],
  ["/notifications", "Notifications"],
  ["/profile", "My account"],
];

const reviewerLinks = [
  ["/admin/requests", "Request review"],
  ["/admin/reports", "Safety reports"],
  ["/admin/missions", "Mission review"],
  ["/admin/verifications", "Identity review"],
];

const adminLinks = [
  ["/admin/donations", "Donations"],
  ["/admin/privacy-requests", "Privacy cases"],
  ["/admin/audit-logs", "Audit log"],
];

function NavLink({ href, label, pathname }) {
  const active = pathname === href;
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        className={`min-h-11 items-center justify-center rounded-xl px-3 ${
          active ? "bg-mint" : "bg-transparent"
        }`}
      >
        <Text
          className={`text-center text-sm font-bold ${active ? "text-pine" : "text-leaf"}`}
        >
          {label}
        </Text>
      </Pressable>
    </Link>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const [hasMounted, setHasMounted] = useState(false);
  const { authenticatedRequest, logout, status, user } = useAuth();
  const displayStatus = hasMounted ? status : "loading";

  useEffect(() => {
    setHasMounted(true);
  }, []);

  const unreadQuery = useQuery({
    queryKey: ["notification-unread-count", user?.id],
    queryFn: () => notificationApi.unreadCount(authenticatedRequest),
    enabled: displayStatus === "authenticated",
  });
  const unreadCount = unreadQuery.data?.unreadCount ?? 0;

  return (
    <View className="w-full rounded-3xl border border-line bg-surface px-3 py-3">
      <View className="w-full items-center gap-3 lg:flex-row">
        <View className="items-center lg:w-44">
          <Link href="/" asChild>
            <Pressable
              accessibilityRole="link"
              className="min-h-12 items-center justify-center px-3"
            >
              <Text className="text-center text-xl font-black tracking-tight text-pine">
                SolveOne PH
              </Text>
              <Text className="text-center text-xs font-semibold uppercase tracking-widest text-muted">
                Problems solved
              </Text>
            </Pressable>
          </Link>
        </View>

        <ScrollView
          className="w-full lg:flex-1"
          contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {publicLinks.map(([href, label]) => (
            <NavLink key={href} href={href} label={label} pathname={pathname} />
          ))}
        </ScrollView>

        <View className="flex-row flex-wrap items-center justify-center gap-1 lg:w-44 lg:justify-end">
          {displayStatus === "authenticated" ? (
            <>
              <Text className="px-2 text-center text-sm font-semibold text-muted">
                Hi, {user.firstName}
              </Text>
              <Pressable
                accessibilityRole="button"
                className="min-h-11 items-center justify-center rounded-xl border border-line px-3"
                onPress={logout}
              >
                <Text className="text-center text-sm font-bold text-leaf">
                  Sign out
                </Text>
              </Pressable>
            </>
          ) : displayStatus === "anonymous" ? (
            <>
              <NavLink href="/login" label="Sign in" pathname={pathname} />
              <Link href="/register" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-11 items-center justify-center rounded-xl bg-pine px-4"
                >
                  <Text className="text-center text-sm font-black text-white">
                    Join
                  </Text>
                </Pressable>
              </Link>
            </>
          ) : (
            <Text className="px-3 text-center text-sm font-semibold text-muted">
              Loading…
            </Text>
          )}
        </View>
      </View>

      {displayStatus === "authenticated" ? (
        <>
          <ScrollView
            className="mt-3 w-full border-t border-line pt-3 lg:hidden"
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            horizontal
            showsHorizontalScrollIndicator={false}
          >
            {memberLinks.map(([href, label]) => (
              <NavLink
                key={href}
                href={href}
                label={
                  href === "/notifications" && unreadCount
                    ? `${label} (${unreadCount})`
                    : label
                }
                pathname={pathname}
              />
            ))}
          </ScrollView>
          <View className="mt-3 hidden w-full flex-row flex-wrap items-center justify-center gap-1 border-t border-line pt-3 lg:flex">
            {memberLinks.map(([href, label]) => (
              <NavLink
                key={href}
                href={href}
                label={
                  href === "/notifications" && unreadCount
                    ? `${label} (${unreadCount})`
                    : label
                }
                pathname={pathname}
              />
            ))}
          </View>
        </>
      ) : null}

      {displayStatus === "authenticated" &&
      ["moderator", "admin"].includes(user.role) ? (
        <View className="mt-3 w-full flex-row flex-wrap items-center justify-center gap-1 rounded-2xl bg-mint p-2">
          <Text className="px-2 text-center text-xs font-black uppercase tracking-widest text-coral">
            Operations
          </Text>
          {reviewerLinks.map(([href, label]) => (
            <NavLink key={href} href={href} label={label} pathname={pathname} />
          ))}
          {user.role === "admin"
            ? adminLinks.map(([href, label]) => (
                <NavLink
                  key={href}
                  href={href}
                  label={label}
                  pathname={pathname}
                />
              ))
            : null}
        </View>
      ) : null}
    </View>
  );
}
