import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "../features/auth/AuthContext";

export function SessionLoadingOverlay() {
  const { status } = useAuth();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (status !== "loading") {
      setVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setVisible(true), 120);
    return () => clearTimeout(timer);
  }, [status]);

  if (!visible || status !== "loading") return null;

  return (
    <View
      accessibilityLabel="Loading SolveOne PH"
      accessibilityRole="progressbar"
      style={styles.overlay}
    >
      <View className="w-full max-w-sm items-center rounded-3xl border border-line bg-surface p-8">
        <View className="h-16 w-16 items-center justify-center rounded-2xl bg-pine">
          <Text className="text-2xl font-black text-white">S1</Text>
        </View>
        <Text className="mt-5 text-2xl font-black text-ink">SolveOne PH</Text>
        <Text className="mt-2 text-center leading-6 text-muted">
          Restoring your secure session…
        </Text>
        <ActivityIndicator className="mt-6" color="#18392B" size="large" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "rgba(247, 244, 236, 0.96)",
    justifyContent: "center",
    padding: 20,
    zIndex: 1000,
  },
});
