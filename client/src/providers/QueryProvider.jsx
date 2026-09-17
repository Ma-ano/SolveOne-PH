import NetInfo from "@react-native-community/netinfo";
import {
  QueryClient,
  QueryClientProvider,
  focusManager,
  onlineManager,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppState, Platform } from "react-native";

import { isRetryableReadError } from "../services/api/client";

onlineManager.setEventListener((setOnline) =>
  NetInfo.addEventListener((state) => {
    setOnline(
      state.isConnected === true && state.isInternetReachable !== false,
    );
  }),
);

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30000,
        gcTime: 5 * 60 * 1000,
        refetchOnReconnect: true,
        retry(failureCount, error) {
          return failureCount < 2 && isRetryableReadError(error);
        },
        retryDelay(attempt) {
          return Math.min(1000 * 2 ** attempt, 5000);
        },
      },
      mutations: {
        retry: false,
      },
    },
  });
}

export function QueryProvider({ children }) {
  const [queryClient] = useState(createQueryClient);

  useEffect(() => {
    if (Platform.OS === "web") {
      return undefined;
    }

    const subscription = AppState.addEventListener("change", (status) => {
      focusManager.setFocused(status === "active");
    });

    return () => subscription.remove();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
