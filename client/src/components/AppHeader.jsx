import { useQuery } from "@tanstack/react-query";
import { Link, usePathname, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

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

function fallbackFor(pathname, authenticated) {
  if (pathname.startsWith("/admin/")) return "/profile";
  if (pathname.includes("request") || pathname === "/discover")
    return "/requests";
  if (pathname.includes("giveaway")) return "/giveaway-items";
  if (pathname.includes("mission")) return "/community-missions";
  if (pathname === "/public-profile") return "/requests";
  if (["/login", "/register", "/forgot-password"].includes(pathname))
    return "/";
  return authenticated ? "/profile" : "/";
}

function NavLink({ href, label, pathname }) {
  const active = pathname === href;
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        className={`min-h-11 justify-center rounded-xl px-3 ${
          active ? "bg-mint" : "bg-transparent"
        }`}
      >
        <Text
          className={`text-sm font-bold ${active ? "text-pine" : "text-leaf"}`}
        >
          {label}
        </Text>
      </Pressable>
    </Link>
  );
}

export function AppHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [hasMounted, setHasMounted] = useState(false);
  const { authenticatedRequest, isAuthenticated, logout, status, user } =
    useAuth();
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

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackFor(pathname, isAuthenticated));
  };

  return (
    <View className="border-b border-line pb-5">
      <View className="flex-row flex-wrap items-center justify-between gap-3">
        <Link href="/" asChild>
          <Pressable
            accessibilityRole="link"
            className="min-h-12 justify-center"
          >
            <Text className="text-xl font-black tracking-tight text-pine">
              SolveOne PH
            </Text>
            <Text className="text-xs font-semibold uppercase tracking-widest text-muted">
              Problems solved
            </Text>
          </Pressable>
        </Link>
        <View className="flex-row flex-wrap items-center gap-2">
          {displayStatus === "authenticated" ? (
            <>
              <Text className="px-2 text-sm font-semibold text-muted">
                Hi, {user.firstName}
              </Text>
              <Pressable
                accessibilityRole="button"
                className="min-h-11 justify-center rounded-xl border border-line px-3"
                onPress={logout}
              >
                <Text className="text-sm font-bold text-leaf">Sign out</Text>
              </Pressable>
            </>
          ) : displayStatus === "anonymous" ? (
            <>
              <NavLink href="/login" label="Sign in" pathname={pathname} />
              <Link href="/register" asChild>
                <Pressable
                  accessibilityRole="link"
                  className="min-h-11 justify-center rounded-xl bg-pine px-4"
                >
                  <Text className="text-sm font-black text-white">Join</Text>
                </Pressable>
              </Link>
            </>
          ) : (
            <Text className="text-sm font-semibold text-muted">Loading…</Text>
          )}
        </View>
      </View>

      <View className="mt-4 flex-row flex-wrap items-center gap-1">
        {publicLinks.map(([href, label]) => (
          <NavLink key={href} href={href} label={label} pathname={pathname} />
        ))}
        {displayStatus === "authenticated"
          ? memberLinks.map(([href, label]) => (
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
            ))
          : null}
      </View>

      {displayStatus === "authenticated" &&
      ["moderator", "admin"].includes(user.role) ? (
        <View className="mt-3 flex-row flex-wrap items-center gap-1 rounded-2xl bg-surface p-2">
          <Text className="px-2 text-xs font-black uppercase tracking-widest text-coral">
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

      {pathname !== "/" ? (
        <View className="mt-4 border-t border-line pt-3">
          <Pressable
            accessibilityLabel="Go back to the previous page"
            accessibilityRole="button"
            className="min-h-11 flex-row items-center self-start rounded-xl px-2"
            onPress={goBack}
          >
            <Text className="text-sm font-black text-leaf">← Back</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
