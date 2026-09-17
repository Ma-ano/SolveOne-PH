import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { io } from "socket.io-client";

import { useAuth } from "../auth/AuthContext";
import { clientConfig } from "../../config/env";

const RealtimeContext = createContext(null);

export function RealtimeProvider({ children }) {
  const { accessToken, status: authStatus } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef(null);
  const [status, setStatus] = useState("disconnected");

  useEffect(() => {
    if (authStatus !== "authenticated" || !accessToken) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setStatus("disconnected");
      return undefined;
    }

    const socket = io(clientConfig.realtimeUrl, {
      auth: { token: accessToken },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    setStatus("connecting");
    const refreshNotifications = () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({
        queryKey: ["notification-unread-count"],
      });
    };
    socket.on("connect", () => {
      setStatus("connected");
      refreshNotifications();
    });
    socket.on("disconnect", () => setStatus("disconnected"));
    socket.on("connect_error", () => setStatus("unavailable"));
    socket.on("message:created", ({ conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["conversation-messages", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
    socket.on("conversation:updated", ({ conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["conversation", conversationId],
      });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    });
    socket.on("conversation:read", ({ conversationId }) => {
      queryClient.invalidateQueries({
        queryKey: ["conversation-messages", conversationId],
      });
    });
    socket.on("notification:created", refreshNotifications);
    socket.on("notification:read", refreshNotifications);
    socket.on("notification:read-all", refreshNotifications);

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [accessToken, authStatus, queryClient]);

  const joinConversation = useCallback(async (conversationId) => {
    const socket = socketRef.current;
    if (!socket?.connected) {
      return { connected: false };
    }
    return new Promise((resolve, reject) => {
      socket
        .timeout(5000)
        .emit("conversation:join", { conversationId }, (error, response) => {
          if (error) {
            reject(new Error("Realtime connection timed out"));
          } else if (!response?.success) {
            reject(
              new Error(response?.error?.message ?? "Conversation unavailable"),
            );
          } else {
            resolve({ connected: true });
          }
        });
    });
  }, []);

  const value = useMemo(
    () => ({ status, joinConversation }),
    [joinConversation, status],
  );
  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtime must be used within RealtimeProvider");
  }
  return context;
}
