import { usePathname, useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useAuth } from "../features/auth/AuthContext";

function fallbackFor(pathname, authenticated) {
  if (pathname.startsWith("/admin/")) return "/profile";
  if (pathname.includes("request") || pathname === "/discover") {
    return "/requests";
  }
  if (pathname.includes("giveaway")) return "/giveaway-items";
  if (pathname.includes("mission")) return "/community-missions";
  if (pathname === "/public-profile") return "/requests";
  if (["/login", "/register", "/forgot-password"].includes(pathname)) {
    return "/";
  }
  return authenticated ? "/profile" : "/";
}

export function PageBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  if (pathname === "/") return null;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace(fallbackFor(pathname, isAuthenticated));
  };

  return (
    <Pressable
      accessibilityLabel="Go back to the previous page"
      accessibilityRole="button"
      className="mb-6 min-h-11 flex-row items-center self-start rounded-full border border-line bg-surface py-2 pl-2 pr-4"
      onPress={goBack}
    >
      <View className="mr-2 h-7 w-7 items-center justify-center rounded-full bg-mint">
        <Text className="text-base font-black text-pine">←</Text>
      </View>
      <Text className="text-sm font-black text-leaf">Back</Text>
    </Pressable>
  );
}
