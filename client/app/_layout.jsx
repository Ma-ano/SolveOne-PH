import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AppProviders } from "../src/providers/AppProviders";
import "../global.css";

export default function RootLayout() {
  return (
    <AppProviders>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "#F7F4EC" },
        }}
      />
      <StatusBar style="dark" />
    </AppProviders>
  );
}
