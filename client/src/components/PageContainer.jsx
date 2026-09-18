import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppHeader } from "./AppHeader";
import { PageTransition } from "./PageTransition";

export function PageContainer({ children }) {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-screen-xl flex-1 self-center px-4 py-5 sm:px-5 md:px-8 md:py-8 lg:px-10">
          <AppHeader />
          <PageTransition>{children}</PageTransition>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
