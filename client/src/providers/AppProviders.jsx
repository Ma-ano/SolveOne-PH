import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthProvider } from "../features/auth/AuthContext";
import { RealtimeProvider } from "../features/messaging/RealtimeContext";
import { QueryProvider } from "./QueryProvider";

export function AppProviders({ children }) {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <RealtimeProvider>{children}</RealtimeProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
