import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export function PageContainer({ children }) {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right"]}>
      <ScrollView
        className="flex-1 bg-canvas"
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="w-full max-w-screen-xl flex-1 self-center px-5 py-8 md:px-10 md:py-12 lg:px-14">
          {children}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
