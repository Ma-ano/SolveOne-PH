import { SafeAreaProvider } from "react-native-safe-area-context";

import { MotionProvider } from "../components/MotionProvider";
import { SessionLoadingOverlay } from "../components/SessionLoadingOverlay";
import { AuthProvider } from "../features/auth/AuthContext";
import { RealtimeProvider } from "../features/messaging/RealtimeContext";
import { QueryProvider } from "./QueryProvider";

export function AppProviders({ children }) {
  return (
    <SafeAreaProvider>
      <QueryProvider>
        <AuthProvider>
          <MotionProvider>
            <RealtimeProvider>{children}</RealtimeProvider>
            <SessionLoadingOverlay />
          </MotionProvider>
        </AuthProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
