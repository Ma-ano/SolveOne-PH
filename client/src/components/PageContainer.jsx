import { useRef, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "./AppHeader";
import { AppFooter } from "./AppFooter";
import { PageBackButton } from "./PageBackButton";
import { PageTransition } from "./PageTransition";
import { StickyHeader } from "./StickyHeader";

export function PageContainer({ children }) {
  const [headerHidden, setHeaderHidden] = useState(false);
  const previousOffset = useRef(0);

  const handleScroll = (event) => {
    const offset = Math.max(0, event.nativeEvent.contentOffset.y);
    const delta = offset - previousOffset.current;

    if (offset < 24 || delta < -3) setHeaderHidden(false);
    else if (offset > 88 && delta > 3) setHeaderHidden(true);

    previousOffset.current = offset;
  };

  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
        onScroll={handleScroll}
        scrollEventThrottle={32}
        stickyHeaderIndices={Platform.OS === "web" ? undefined : [0]}
      >
        <StickyHeader hidden={headerHidden}>
          <View
            className="mx-auto w-full self-center px-4 pt-4 sm:px-6 md:px-10 md:pt-5 xl:px-12"
            style={{ maxWidth: 1280 }}
          >
            <AppHeader />
          </View>
        </StickyHeader>
        <View
          className="w-full flex-1 self-center px-4 pb-5 pt-5 sm:px-6 md:px-10 md:pb-8 md:pt-7 xl:px-12"
          style={{ maxWidth: 1280 }}
        >
          <PageBackButton />
          <PageTransition>{children}</PageTransition>
          <AppFooter />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
